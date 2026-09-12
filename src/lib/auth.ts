import { drizzleAdapter } from '@better-auth/drizzle-adapter/relations-v2';
import { type BetterAuthOptions, betterAuth } from 'better-auth';
import { jwt, openAPI } from 'better-auth/plugins';
import { admin as adminPlugin } from 'better-auth/plugins/admin';
import { db } from '../data/database.js';
import * as schema from '../data/schemas/auth-schema.js';
import { accessControl, admin, deacon, smallGroupLeader, user } from '../permissions/statements.js';

const authConfig: BetterAuthOptions = {
	database: drizzleAdapter(db, {
		provider: 'pg',
		schema: schema,
	}),
	emailAndPassword: {
		enabled: true,
	},
	plugins: [
		adminPlugin({
			ac: accessControl,
			roles: {
				admin,
				user,
				smallGroupLeader,
				deacon,
			},
		}),
		jwt({
			disableSettingJwtHeader: true,
			jwks: {
				jwksPath: '/.well-known/jwks.json',
			},
		}),
		openAPI(),
	],
};

export const auth = betterAuth(authConfig) as ReturnType<typeof betterAuth<typeof authConfig>>;
