import { drizzleAdapter } from '@better-auth/drizzle-adapter/relations-v2';
import { type BetterAuthOptions, betterAuth } from 'better-auth';
import { jwt } from 'better-auth/plugins';
import { admin } from 'better-auth/plugins/admin';
import { db } from '../data/database.js';
import * as schema from '../data/schemas/auth-schema.js';

const authConfig: BetterAuthOptions = {
	database: drizzleAdapter(db, {
		provider: 'pg',
		schema: schema,
	}),
	emailAndPassword: {
		enabled: true,
	},
	plugins: [
		admin(),
		jwt({
			disableSettingJwtHeader: true,
			jwks: {
				jwksPath: '/.well-known/jwks.json',
			},
		}),
	],
};

export const auth = betterAuth(authConfig) as ReturnType<typeof betterAuth<typeof authConfig>>;
