import { existsSync } from 'node:fs';
import { defineConfig } from 'drizzle-kit';

// drizzle-kit loads this file itself, so the dev script's --env-file flag doesn't reach it. Load .env
// with Node's built-in parser when present (local dev); in a migrate container there is no .env and the
// real env vars are used. Variables already set in the environment win over the file.
if (existsSync('.env')) process.loadEnvFile('.env');

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL must be set (see .env.example)');

export default defineConfig({
	out: './drizzle',
	schema: './src/data/schemas',
	dialect: 'postgresql',
	dbCredentials: {
		url: databaseUrl,
	},
});
