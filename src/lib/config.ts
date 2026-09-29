import { isIP } from 'node:net';
import { z } from 'zod';

// One TRUSTED_PROXIES entry: a bare IP ("10.0.0.5") or a CIDR range ("10.0.0.0/16", "2400:cb00::/32").
// better-auth accepts both but only *warns* on a malformed one and then ignores it, which can silently
// leave the list empty and downgrade client-IP resolution - so we reject it at startup instead.
function isValidProxyEntry(entry: string): boolean {
	const [address, prefix, ...extra] = entry.split('/');
	if (!address || extra.length > 0) return false;
	const family = isIP(address); // 0 = not an IP, otherwise 4 or 6
	if (family === 0) return false;
	if (prefix === undefined) return true;
	return /^\d+$/.test(prefix) && Number(prefix) <= (family === 4 ? 32 : 128);
}

function splitCommaList(value: string): string[] {
	return value
		.split(',')
		.map((entry) => entry.trim())
		.filter(Boolean);
}

// A browser's Origin header is exactly scheme://host[:port], so a CORS entry with a path or a
// trailing slash ("https://app.example.org/") would never match and silently block that client.
function isBareOrigin(entry: string): boolean {
	return URL.canParse(entry) && new URL(entry).origin === entry;
}

const envSchema = z
	.object({
		// Standard Node convention, defaulting the way Node itself does when unset. better-auth
		// reads this directly (not through our config object) to decide things like whether rate
		// limiting is on by default and its dev-mode IP fallback - see src/lib/auth.ts.
		NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
		BETTER_AUTH_SECRET: z.string().min(1, 'BETTER_AUTH_SECRET must be set (see .env.example)'),

		BETTER_AUTH_URL: z.url('BETTER_AUTH_URL must be a valid URL (see .env.example)'),
		// The port this process binds to. Deliberately separate from BETTER_AUTH_URL: that is the
		// *public* URL clients (and better-auth's cookies/CSRF/JWKS issuer) see, which behind an ALB
		// is https://staff.example.org on 443, while the container itself listens on an unprivileged
		// port. Defaults to 5000 so local dev keeps working with the default BETTER_AUTH_URL.
		PORT: z.coerce.number().int().min(1).max(65535).default(5000),
		// Extra origins better-auth trusts for its CSRF (Origin header) and redirect-target checks, on
		// top of BETTER_AUTH_URL's origin, which it always trusts. Empty by default: behind the staff-app
		// proxy the browser's origin *is* BETTER_AUTH_URL's. Entries go to better-auth as-is, so its
		// wildcard ("https://*.example.org") and custom-scheme ("myapp://", for a mobile app) patterns work.
		TRUSTED_ORIGINS: z.string().default('').transform(splitCommaList),
		// Origins allowed to call this service cross-origin from a browser (CORS). Empty by default,
		// and empty means the CORS middleware isn't mounted at all: no browser calls this service
		// cross-origin today (staff-app proxies /api/auth/* same-origin). Native mobile apps don't need
		// CORS - it's a browser mechanism. Must be exact origins, since that's what browsers send.
		CORS_ORIGINS: z
			.string()
			.default('')
			.transform(splitCommaList)
			.refine((entries) => entries.every(isBareOrigin), {
				message:
					'CORS_ORIGINS must be a comma-separated list of bare origins, e.g. https://app.example.org (no path or trailing slash)',
			}),
		// The single canonical origin staff-app is served from - distinct from the origin lists above
		// since this needs to be *one* unambiguous value: better-invite's
		// defaultRedirectToSignUp/defaultRedirectToSignIn (see auth.ts) build absolute URLs from it,
		// because an invitee's first click lands cold on auth-server itself, straight from their
		// email client, with no staff-app page loaded yet to supply a relative-path fallback.
		STAFF_APP_URL: z.url('STAFF_APP_URL must be a valid URL (see .env.example)'),
		DATABASE_URL: z.string().min(1, 'DATABASE_URL must be set (see .env.example)'),
		DB_POOL_MAX: z.coerce.number().int().positive().default(10),
		DB_IDLE_TIMEOUT_MS: z.coerce.number().int().nonnegative().default(10_000),
		DB_CONNECTION_TIMEOUT_MS: z.coerce.number().int().nonnegative().default(5_000),
		REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
		HEADERS_TIMEOUT_MS: z.coerce.number().int().positive().default(20_000),
		KEEP_ALIVE_TIMEOUT_MS: z.coerce.number().int().positive().default(5_000),
		SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().positive().default(20_000),
		RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().positive().default(10),
		RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),
		RESEND_API_KEY: z.string().min(1, 'RESEND_API_KEY must be set (see .env.example)'),
		RESEND_FROM_EMAIL: z.string().min(1, 'RESEND_FROM_EMAIL must be set (see .env.example)'),
		// Comma-separated IPs/CIDR ranges of the reverse proxies (load balancer, CDN) allowed to
		// append to X-Forwarded-For. better-auth walks that header right to left, skips these, and
		// treats the first address that isn't one of them as the real client - so a client-supplied
		// leftmost entry is never believed. Deliberately required (no default) so that "no proxy in
		// front" is always a conscious choice: an empty value means exactly that, and src/index.ts then
		// overwrites the header with the TCP peer address instead (and warns when NODE_ENV=production).
		TRUSTED_PROXIES: z
			.string('TRUSTED_PROXIES must be set - an empty value means "no proxy in front" (see .env.example)')
			.transform(splitCommaList)
			.refine((entries) => entries.every(isValidProxyEntry), {
				message: 'TRUSTED_PROXIES must be a comma-separated list of IPs or CIDR ranges (e.g. 10.0.0.0/16)',
			}),
	})
	.refine((data) => data.HEADERS_TIMEOUT_MS <= data.REQUEST_TIMEOUT_MS, {
		message: 'HEADERS_TIMEOUT_MS must be <= REQUEST_TIMEOUT_MS (headers are part of the full request)',
		path: ['HEADERS_TIMEOUT_MS'],
	})
	.refine((data) => data.KEEP_ALIVE_TIMEOUT_MS < data.HEADERS_TIMEOUT_MS, {
		message:
			'KEEP_ALIVE_TIMEOUT_MS must be < HEADERS_TIMEOUT_MS, otherwise a reused keep-alive socket can be timed out as if its headers never arrived',
		path: ['KEEP_ALIVE_TIMEOUT_MS'],
	});

const parsedEnv = envSchema.safeParse(process.env);
if (!parsedEnv.success) {
	throw new Error(`Invalid environment configuration:\n${z.prettifyError(parsedEnv.error)}`);
}

const env = parsedEnv.data;

// BETTER_AUTH_URL is the *public* URL: better-auth uses it for cookie domains, trusted-origin/CSRF
// checks, OAuth callbacks, and the JWKS issuer. It says nothing about the port this process
// listens on (behind an ALB it's https://host on 443 while we bind an unprivileged port) - that's PORT.
const betterAuthUrl = new URL(env.BETTER_AUTH_URL);

// Stripped of a trailing slash so string interpolation (`${config.staffAppUrl}/sign-up`) never
// produces a double slash - see auth.ts's invite plugin config.
const staffAppUrl = env.STAFF_APP_URL.replace(/\/+$/, '');

export const config = {
	nodeEnv: env.NODE_ENV,
	isProduction: env.NODE_ENV === 'production',
	betterAuthSecret: env.BETTER_AUTH_SECRET,
	betterAuthUrl,
	port: env.PORT,
	trustedOrigins: env.TRUSTED_ORIGINS,
	corsOrigins: env.CORS_ORIGINS,
	staffAppUrl,
	databaseUrl: env.DATABASE_URL,
	dbPoolMax: env.DB_POOL_MAX,
	dbIdleTimeoutMs: env.DB_IDLE_TIMEOUT_MS,
	dbConnectionTimeoutMs: env.DB_CONNECTION_TIMEOUT_MS,
	requestTimeoutMs: env.REQUEST_TIMEOUT_MS,
	headersTimeoutMs: env.HEADERS_TIMEOUT_MS,
	keepAliveTimeoutMs: env.KEEP_ALIVE_TIMEOUT_MS,
	shutdownTimeoutMs: env.SHUTDOWN_TIMEOUT_MS,
	rateLimitWindowSeconds: env.RATE_LIMIT_WINDOW_SECONDS,
	rateLimitMax: env.RATE_LIMIT_MAX,
	trustedProxies: env.TRUSTED_PROXIES,
	resendApiKey: env.RESEND_API_KEY,
	resendFromEmail: env.RESEND_FROM_EMAIL,
} as const;
