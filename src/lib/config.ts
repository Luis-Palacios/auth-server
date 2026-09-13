import 'dotenv/config';
import { z } from 'zod';

const envSchema = z
	.object({
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
} as const;
