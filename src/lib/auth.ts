import { drizzleAdapter } from '@better-auth/drizzle-adapter/relations-v2';
import { type BetterAuthOptions, type BetterAuthPlugin, betterAuth } from 'better-auth';
import { jwt, openAPI } from 'better-auth/plugins';
import { admin as adminPlugin } from 'better-auth/plugins/admin';
import { invite } from 'better-invite';
import { Resend } from 'resend';
import { db } from '../data/database.js';
import * as schema from '../data/schemas/auth-schema.js';
import { accessControl, admin, deacon, elder, pending, smallGroupLeader, user } from '../permissions/statements.js';
import { config } from './config.js';

const resend = new Resend(config.resendApiKey);

const authConfig = {
	secret: config.betterAuthSecret,
	trustedOrigins: config.corsOrigins,
	database: drizzleAdapter(db, {
		provider: 'pg',
		schema: schema,
	}),
	emailAndPassword: {
		enabled: true,
		requireEmailVerification: true,
		sendResetPassword: async ({ user, url }) => {
			void resend.emails.send({
				from: `Ekklesiaio <${config.resendFromEmail}>`,
				to: user.email,
				subject: 'Reset your password',
				html: `Click the link to reset your password: ${url}`,
			});
		},
	},
	emailVerification:{
		sendOnSignUp: true,
		autoSignInAfterVerification: true,
		sendVerificationEmail: async ({ user, url }) => {
			void resend.emails.send({
				from: `Ekklesiaio <${config.resendFromEmail}>`,
				to: user.email,
				subject: 'Verify your email address',
				template: {
					id: 'ekklesiaio-verify-email',
					variables: {
						verificationUrl: url,
					},
				}
			});
		}
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
		invite({
			// Gates /invite/create and /invite/cancel against the same accessControl/statements.ts
			// used everywhere else - checkPermissions (in better-invite's own source) forwards this
			// straight to the admin plugin's userHasPermission endpoint, so admin/elder (the only
			// roles with the `invites` statement - see statements.ts) are the only ones who can
			// create or cancel an invite. Accepting an invite (canAcceptInvite) is left at its
			// default (anyone can accept the invite addressed to them) - no reason to restrict that.
			canCreateInvite: { statement: 'invites', permissions: ['create'] },
			canCancelInvite: { statement: 'invites', permissions: ['cancel'] },
			// How long the invite link itself stays valid before someone clicks it at all.
			invitationTokenExpiresIn: 60 * 60 * 24 * 7, // 7 days
			// How long the browser keeps the invite token (in a signed cookie) between clicking the
			// invite link and finishing sign-up. better-invite's own default here is 10 minutes,
			// which assumes a single-step sign-up - ours is two emails (invite, then this app's own
			// verification email from emailVerification.sendVerificationEmail above), so the real
			// window a real invitee needs is much longer than "filling out one form."
			inviteCookieMaxAge: 60 * 60 * 24, // 24 hours
			sendUserInvitation: async ({ email, role, token }, request) => {
				// Deliberately ignoring the plugin-built `url` here (points at auth-server's own
				// GET /invite/:token, which sets a cookie scoped to auth-server's origin - a confirmed
				// bug there drops the callbackURL query param, and even without that bug, that cookie
				// would never survive a redirect to staff-app's separate origin in production). Instead,
				// point straight at a small staff-app page that activates the invite itself via the
				// plugin's *other* endpoint (POST /invite/activate, JSON in/out, no redirect logic to
				// get wrong) through the existing same-origin /api/auth/* proxy - see
				// app/(auth)/accept-invite/ in staff-app.
				const acceptUrl = `${config.staffAppUrl}/accept-invite?token=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}`;

				// better-invite's own callback payload has no inviter info at all (verified in its
				// source: the `name` field here is the *invitee's* existing name, if any, never the
				// inviter's) - but `request` is the actual incoming POST /invite/create request, which
				// still carries the inviter's session cookie (that endpoint is session-gated), so the
				// inviter can be resolved the same way src/routes/custom-auth/invites.ts already does.
				const inviterSession = request ? await auth.api.getSession({ headers: request.headers }) : null;
				const inviterName = inviterSession?.user.name ?? 'a team member';
				const inviterEmail = inviterSession?.user.email ?? '';

				void resend.emails.send({
					from: `Ekklesiaio <${config.resendFromEmail}>`,
					to: email,
					subject: "You've been invited to Ekklesiaio",
					template: {
						id: 'ekklesiaio-invite-user',
						variables: {
							inviterName,
							inviterEmail,
							role,
							url: acceptUrl,
							email,
						},
					}
				});
			},
			// Widened to the generic plugin type: better-invite's own published .d.mts imports
			// InviteType/InviteTypeWithId from an internal module it never re-exports from its public
			// entry point, so TypeScript refuses (TS2883) to let that type flow into `auth`'s inferred
			// type anywhere below - not fixable from this side without patching better-invite's types.
			// Costs nothing here: auth-server never calls this plugin's endpoints in-process (only
			// staff-app's browser does, via authClient.invite.* through the proxy), so only
			// getSession/userHasPermission (from core/admin, both properly exported) need to survive
			// on `auth.api` - see src/routes/custom-auth/invites.ts.
		}) as BetterAuthPlugin,
		jwt({
			disableSettingJwtHeader: true,
			jwks: {
				jwksPath: '/.well-known/jwks.json',
			},
			jwt: {
				// Only `role` goes in the payload (see AUTH-INTEGRATION-ROADMAP.md's Phase 4/"Role vs
				// permission" notes) - not the full user row, which is definePayload's default when
				// unset (verified live: it was leaking name/email/ban status/etc. before this change).
				// `sub` (user id) is set separately by better-auth itself, so it doesn't need to be
				// returned here.
				definePayload: ({ user }) => ({ role: user.role }),
			},
		}),
		openAPI(),
	],
} satisfies BetterAuthOptions;

export const auth: ReturnType<typeof betterAuth<typeof authConfig>> = betterAuth(authConfig);
