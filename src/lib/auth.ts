import { drizzleAdapter } from '@better-auth/drizzle-adapter/relations-v2';
import { type BetterAuthOptions, type BetterAuthPlugin, betterAuth } from 'better-auth';
import { customSession, jwt, openAPI } from 'better-auth/plugins';
import { admin as adminPlugin } from 'better-auth/plugins/admin';
import { invite } from 'better-invite';
import { db } from '../data/database.js';
import * as schema from '../data/schemas/auth-schema.js';
import { getLocale } from '../emails/locale.js';
import { accessControl, permissionsFor, roles } from '../permissions/statements.js';
import { adminGuard } from './admin-guard.js';
import { config } from './config.js';
import { sendInviteUserEmail, sendResetPasswordEmail, sendVerifyEmail } from './emails.js';
import { notifyInviteAccepted } from './member-link-notifier.js';

// Requests to /get-session or /token from one IP before a 429; see rateLimit below.
const SESSION_READ_RATE_LIMIT_MAX = 300;

const baseConfig = {
	secret: config.betterAuthSecret,
	// Passed explicitly so better-auth uses the validated value rather than reading
	// process.env.BETTER_AUTH_URL itself. Its origin is always trusted for CSRF/redirect checks.
	baseURL: config.betterAuthUrl.origin,
	trustedOrigins: config.trustedOrigins,
	database: drizzleAdapter(db, {
		provider: 'pg',
		schema: schema,
	}),
	emailAndPassword: {
		enabled: true,
		requireEmailVerification: true,
		sendResetPassword: async ({ user, url }, request) => {
			const locale = getLocale(request);
			void sendResetPasswordEmail({ to: user.email, url, locale });
		},
	},
	emailVerification: {
		sendOnSignUp: true,
		autoSignInAfterVerification: true,
		sendVerificationEmail: async ({ user, token }, request) => {
			// Deliberately ignoring the plugin-built `url` here (auth-server's GET /verify-email,
			// which verifies - and, with autoSignInAfterVerification, signs in - on page load, so a
			// mail client's link scanner prefetching it would consume the token and get the session).
			// Instead, point at a staff-app page that only calls that endpoint when the user presses
			// a button - see app/(auth)/verify-email/ in staff-app. `email` lets that page offer
			// "resend" when the token has expired.
			const verificationUrl = `${config.staffAppUrl}/verify-email?token=${encodeURIComponent(token)}&email=${encodeURIComponent(user.email)}`;
			const locale = getLocale(request);
			void sendVerifyEmail({ to: user.email, verificationUrl, locale });
		},
	},
	// `enabled` is left unset so it falls through to better-auth's own default (on iff
	// NODE_ENV=production - see config.nodeEnv). window/max here only set the *general* limit;
	// better-auth already applies its own tighter built-in rules to sign-in/sign-up/password-reset
	// regardless of these values (3 requests per 10-60s - see its rate-limiter source), so no
	// customRules are needed for the brute-force-prone endpoints specifically.
	//
	// "max per window" is not a rate here. Each allowed request moves the window forward, so an IP's
	// count (kept per path) only resets after a full window with no allowed request: `max` requests
	// with no such pause get a 429, however slowly they arrive (better-auth 1.7.2's decideConsume).
	// /get-session and /token get a higher max because every staff-app page load and server action
	// calls them, and everyone behind one IP (church Wi-Fi) shares the count. They stay limited, not
	// exempt: get-session hits the database on every call and browsers can reach it too. Keys are
	// exact matches on the path without /api/auth or a trailing slash, as the limiter normalizes it.
	rateLimit: {
		window: config.rateLimitWindowSeconds,
		max: config.rateLimitMax,
		customRules: {
			'/get-session': { window: config.rateLimitWindowSeconds, max: SESSION_READ_RATE_LIMIT_MAX },
			'/token': { window: config.rateLimitWindowSeconds, max: SESSION_READ_RATE_LIMIT_MAX },
		},
	},
	// Which hops in X-Forwarded-For are our own infrastructure (see TRUSTED_PROXIES in config.ts).
	// With a non-empty list better-auth reads the header right to left, skips these, and keys rate
	// limiting on the first address that isn't one of them - so a client-supplied leftmost entry is
	// ignored. With an empty list it falls back to accepting only a single-address header, which is
	// what src/index.ts guarantees by overwriting the header when no proxy is configured.
	advanced: {
		ipAddress: {
			trustedProxies: config.trustedProxies,
		},
	},
	// Rules 5-7 of the user-admin-actions spec: who may change whose role or ban whom.
	hooks: { before: adminGuard },
	plugins: [
		adminPlugin({
			ac: accessControl,
			roles,
			// freshly signed-up account should have no access at all
			// until an admin or elder assigns a real role.
			defaultRole: 'pending',
		}),
		invite({
			// Gates /invite/create and /invite/cancel on the `invites` statement (statements.ts), so only
			// admin and elder can create or cancel an invite. Functions, not the `{ statement, permissions }`
			// object form: better-invite 0.5.7's checkPermissions calls userHasPermission with
			// `returnHeaders: true` and returns the `{ headers, response }` wrapper, which is always truthy,
			// so the object form let any signed-in user (even `pending`) create an invite with any role.
			// Cancel is also limited to the invite's creator by better-invite itself. Accepting an invite
			// (canAcceptInvite) is left at its default: anyone can accept the invite addressed to them.
			canCreateInvite: ({ inviterUser }) => permissionsFor(inviterUser.role).invites?.includes('create') ?? false,
			canCancelInvite: ({ inviterUser }) => permissionsFor(inviterUser.role).invites?.includes('cancel') ?? false,
			// How long the invite link itself stays valid before someone clicks it at all.
			invitationTokenExpiresIn: 60 * 60 * 24 * 7, // 7 days
			// How long the browser keeps the invite token (in a signed cookie) between clicking the
			// invite link and finishing sign-up. better-invite's own default here is 10 minutes,
			// which assumes a single-step sign-up - ours is two emails (invite, then this app's own
			// verification email from emailVerification.sendVerificationEmail above), so the real
			// window a real invitee needs is much longer than "filling out one form."
			inviteCookieMaxAge: 60 * 60 * 24, // 24 hours
			// Tells membership-management so it can link the new user to the member with that email
			// (member-user-linking spec, D1). Runs for both accept paths (new account after sign-up or
			// verify-email, and an already signed-in user via /invite/activate), and only on accept, never
			// on cancel or reject. The notifier never throws and isn't awaited, so a slow or down
			// membership-management can't delay or fail the accept. Private invites are only consumed by
			// a user whose email is in the invite, so `invitedUser.email` equals the invited address there;
			// a public invite has no email, so fall back to the user's own, which is verified by now
			// (`requireEmailVerification` means no session exists before that).
			inviteHooks: {
				afterAcceptInvite: async ({ invitation, invitedUser }) => {
					void notifyInviteAccepted({ userId: invitedUser.id, email: invitation.email ?? invitedUser.email });
				},
			},
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
				const inviterName = inviterSession?.user.name;
				const inviterEmail = inviterSession?.user.email ?? '';

				// TODO: Hardcoded for now until we add a way to handle multiple tenants/Ministries
				const churchName = 'Petra Managua';
				const ministryName = 'Ministerio Cristiano Petra';

				const locale = getLocale(request);

				void sendInviteUserEmail({
					to: email,
					inviterName,
					inviterEmail,
					role,
					url: acceptUrl,
					churchName: churchName,
					ministryName: ministryName,
					locale,
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
				// Only `role` and the role's computed permissions (`perms`, same shape as the session's
				// `permissions` - see statements.ts) go in the payload, not the full user row, which is
				// definePayload's default when unset (it leaked name/email/ban status/etc.). APIs check
				// `perms`, never `role`. `sub` (user id) is set by better-auth itself.
				definePayload: ({ user }) => ({ role: user.role, perms: permissionsFor(user.role) }),
			},
		}),
		openAPI(),
	],
} satisfies BetterAuthOptions;

const authConfig = {
	...baseConfig,
	plugins: [
		...baseConfig.plugins,
		// Adds the role's computed permissions to GET /api/auth/get-session, next to `user` and
		// `session`. It replaces the getSession endpoint, so in-process auth.api.getSession callers get
		// this shape too and still read `.user`. Computed from user.role on every read (cookieCache is
		// off), so a role change shows on the next request. `baseConfig` is passed only for typing.
		customSession(async ({ user, session }) => ({ user, session, permissions: permissionsFor(user.role) }), baseConfig),
	],
} satisfies BetterAuthOptions;

export const auth: ReturnType<typeof betterAuth<typeof authConfig>> = betterAuth(authConfig);
