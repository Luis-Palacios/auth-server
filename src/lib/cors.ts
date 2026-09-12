// CORS_ORIGINS is the single source of truth for which client origins may talk to this
// server: it feeds both the Hono CORS middleware (src/index.ts) and better-auth's
// trustedOrigins (src/lib/auth.ts), so a client is never allowed by one and rejected by
// the other. Update it here (one env var) when adding/removing deployed client origins.
if (!process.env.CORS_ORIGINS) {
	throw new Error('CORS_ORIGINS must be set (see .env.example)');
}
export const corsOrigins = process.env.CORS_ORIGINS.split(',')
	.map((origin) => origin.trim())
	.filter(Boolean);
