import 'dotenv/config';
import { z } from 'zod';

const envSchema = z
	.object({
		// Standard Node convention, defaulting the way Node itself does when unset. better-auth
		// reads this directly (not through our config object) to decide things like whether rate
		// limiting is on by default and its dev-mode IP fallback - see src/lib/auth.ts.
		NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
		BETTER_AUTH_SECRET: z.string().min(1, 'BETTER_AUTH_SECRET must be set (see .env.example)'),
		BETTER_AUTH_URL: z.url('BETTER_AUTH_URL must be a valid URL (see .env.example)'),
		CORS_ORIGINS: z.string().min(1, 'CORS_ORIGINS must be set (see .env.example)'),
		DATABASE_URL: z.string().min(1, 'DATABASE_URL must be set (see .env.example)'),
		DB_POOL_MAX: z.coerce.number().int().positive().default(10),
		DB_IDLE_TIMEOUT_MS: z.coerce.number().int().nonnegative().default(10_000),
		DB_CONNECTION_TIMEOUT_MS: z.coerce.number().int().nonnegative().default(5_000),
		REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
		HEADERS_TIMEOUT_MS: z.coerce.number().int().positive().default(20_000),
		KEEP_ALIVE_TIMEOUT_MS: z.coerce.number().int().positive().default(5_000),
		RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().positive().default(10),
		RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),
		// Whether to trust an inbound X-Forwarded-For header as-is (only safe once a real reverse
		// proxy sits in front of this service and overwrites that header itself) - see
		// src/index.ts, where this gates the client-IP normalization used for rate limiting.
		// z.coerce.boolean() is deliberately not used here: Boolean("false") is true in JS, so it
		// would coerce the literal string "false" to true.
		TRUST_PROXY: z
			.enum(['true', 'false'])
			.default('false')
			.transform((value) => value === 'true'),
		RESEND_API_KEY: z.string().min(1, 'RESEND_API_KEY must be set (see .env.example)'),
		RESEND_FROM_EMAIL: z.string().min(1, 'RESEND_FROM_EMAIL must be set (see .env.example)'),
		
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

// BETTER_AUTH_URL is the single source of truth for the port: better-auth uses it for cookie
// domains, trusted-origin/CSRF checks, OAuth callbacks, and the JWKS issuer, so the port we
// listen on must always match the port in that URL.
const betterAuthUrl = new URL(env.BETTER_AUTH_URL);
const port = Number(betterAuthUrl.port) || (betterAuthUrl.protocol === 'https:' ? 443 : 80);

// CORS_ORIGINS feeds both the Hono CORS middleware (src/index.ts) and better-auth's
// trustedOrigins (src/lib/auth.ts), so a client is never allowed by one and rejected by the other.
const corsOrigins = env.CORS_ORIGINS.split(',')
	.map((origin) => origin.trim())
	.filter(Boolean);

export const config = {
	nodeEnv: env.NODE_ENV,
	isProduction: env.NODE_ENV === 'production',
	betterAuthSecret: env.BETTER_AUTH_SECRET,
	betterAuthUrl,
	port,
	corsOrigins,
	databaseUrl: env.DATABASE_URL,
	dbPoolMax: env.DB_POOL_MAX,
	dbIdleTimeoutMs: env.DB_IDLE_TIMEOUT_MS,
	dbConnectionTimeoutMs: env.DB_CONNECTION_TIMEOUT_MS,
	requestTimeoutMs: env.REQUEST_TIMEOUT_MS,
	headersTimeoutMs: env.HEADERS_TIMEOUT_MS,
	keepAliveTimeoutMs: env.KEEP_ALIVE_TIMEOUT_MS,
	rateLimitWindowSeconds: env.RATE_LIMIT_WINDOW_SECONDS,
	rateLimitMax: env.RATE_LIMIT_MAX,
	trustProxy: env.TRUST_PROXY,
	resendApiKey: env.RESEND_API_KEY,
	resendFromEmail: env.RESEND_FROM_EMAIL,
} as const;
