import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
	BETTER_AUTH_SECRET: z.string().min(1, 'BETTER_AUTH_SECRET must be set (see .env.example)'),
	BETTER_AUTH_URL: z.url('BETTER_AUTH_URL must be a valid URL (see .env.example)'),
	CORS_ORIGINS: z.string().min(1, 'CORS_ORIGINS must be set (see .env.example)'),
	DATABASE_URL: z.string().min(1, 'DATABASE_URL must be set (see .env.example)'),
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
} as const;
