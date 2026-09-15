import { drizzleAdapter } from '@better-auth/drizzle-adapter/relations-v2';
import { type BetterAuthOptions, betterAuth } from 'better-auth';
import { jwt, openAPI } from 'better-auth/plugins';
import { admin as adminPlugin } from 'better-auth/plugins/admin';
import { db } from '../data/database.js';
import * as schema from '../data/schemas/auth-schema.js';
import { accessControl, admin, deacon, elder, pending, smallGroupLeader, user } from '../permissions/statements.js';
import { config } from './config.js';

const authConfig: BetterAuthOptions = {
	secret: config.betterAuthSecret,
	trustedOrigins: config.corsOrigins,
	database: drizzleAdapter(db, {
		provider: 'pg',
		schema: schema,
	}),
	emailAndPassword: {
		enabled: true,
	},
	// `enabled` is left unset so it falls through to better-auth's own default (on iff
	// NODE_ENV=production - see config.nodeEnv). window/max here only set the *general* limit;
	// better-auth already applies its own tighter built-in rules to sign-in/sign-up/password-reset
	// regardless of these values (3 requests per 10-60s - see its rate-limiter source), so no
	// customRules are needed for the brute-force-prone endpoints specifically.
	rateLimit: {
		window: config.rateLimitWindowSeconds,
		max: config.rateLimitMax,
	},
	plugins: [
		adminPlugin({
			ac: accessControl,
			roles: {
				admin,
				user,
				smallGroupLeader,
				deacon,
				pending,
				elder,
			},
			// freshly signed-up account should have no access at all
			// until an admin or elder assigns a real role.
			defaultRole: 'pending',
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
