import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { type Context, Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { db } from '../../data/database.js';
import { pushSubscriptions } from '../../data/schemas/push.js';
import { auth } from '../../lib/auth.js';
import { config } from '../../lib/config.js';
import {
	isAllowedPushEndpoint,
	MAX_SUBSCRIPTIONS_PER_USER,
	MAX_USER_AGENT_LENGTH,
	subscribeBody,
	unsubscribeBody,
} from '../../notifications/push-input.js';

// Routes staff-app's server actions call with the user's session cookie (notifications spec, Part 2).
// Every error is { code, message }. Not under /api/auth, so better-auth's handler never sees them.
const MAX_BODY_BYTES = 4 * 1024;

type ErrorStatus = 401 | 404 | 422 | 500;

function pushError(c: Context, status: ErrorStatus, code: string, message: string) {
	return c.json({ code, message }, status);
}

async function sessionUserId(c: Context): Promise<string | null> {
	const session = await auth.api.getSession({ headers: c.req.raw.headers });
	return session?.user.id ?? null;
}

const tooLarge = (c: Context) => pushError(c, 422, 'invalid_request', 'The request body is too large.');

export const pushRoute = new Hono()
	.onError((error, c) => {
		console.error('Push route failed', error);
		return pushError(c, 500, 'internal_error', 'Something went wrong.');
	})

	// The public key is what the browser subscribes with. null while push is off.
	.get('/config', async (c) => {
		if (!(await sessionUserId(c))) return pushError(c, 401, 'unauthorized', 'Sign in first.');
		return c.json({ enabled: config.pushEnabled, publicKey: config.pushEnabled ? config.vapidPublicKey : null });
	})

	// Registers this browser for the caller. An endpoint that already exists moves to the caller
	// (rule 9: a device belongs to whoever is signed in on it).
	.put('/subscriptions', bodyLimit({ maxSize: MAX_BODY_BYTES, onError: tooLarge }), async (c) => {
		const userId = await sessionUserId(c);
		if (!userId) return pushError(c, 401, 'unauthorized', 'Sign in first.');
		if (!config.pushEnabled) return pushError(c, 404, 'push_disabled', 'Push notifications are off.');

		const body = subscribeBody.safeParse(await c.req.json().catch(() => undefined));
		if (!body.success) return pushError(c, 422, 'invalid_request', 'The body is not a push subscription.');
		const { endpoint, keys } = body.data;
		if (!isAllowedPushEndpoint(endpoint)) {
			return pushError(c, 422, 'invalid_endpoint', 'That push service is not supported.');
		}
		const userAgent = c.req.header('user-agent')?.slice(0, MAX_USER_AGENT_LENGTH) ?? null;

		await db.transaction(async (tx) => {
			// One registration at a time per user, so two at once can't both pass the cap.
			await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${userId}))`);
			await tx
				.insert(pushSubscriptions)
				.values({ userId, endpoint, p256dh: keys.p256dh, auth: keys.auth, userAgent })
				.onConflictDoUpdate({
					target: pushSubscriptions.endpoint,
					set: { userId, p256dh: keys.p256dh, auth: keys.auth, userAgent, lastUsedAt: sql`now()` },
				});
			// Keep the 10 most recently used (the one just written is the newest); the rest go. Their
			// push_sends rows go with them (cascade).
			const surplus = await tx
				.select({ id: pushSubscriptions.id })
				.from(pushSubscriptions)
				.where(eq(pushSubscriptions.userId, userId))
				.orderBy(desc(pushSubscriptions.lastUsedAt), desc(pushSubscriptions.createdAt), desc(pushSubscriptions.id))
				.offset(MAX_SUBSCRIPTIONS_PER_USER);
			if (surplus.length > 0) {
				await tx.delete(pushSubscriptions).where(
					inArray(
						pushSubscriptions.id,
						surplus.map((row) => row.id),
					),
				);
			}
		});
		return c.body(null, 204);
	})

	// Sign-out cleanup. Not gated on the flag, so it still works if push was turned off meanwhile.
	// Only the caller's own row; one that is gone or someone else's is the same 204.
	.delete('/subscriptions', bodyLimit({ maxSize: MAX_BODY_BYTES, onError: tooLarge }), async (c) => {
		const userId = await sessionUserId(c);
		if (!userId) return pushError(c, 401, 'unauthorized', 'Sign in first.');

		const body = unsubscribeBody.safeParse(await c.req.json().catch(() => undefined));
		if (!body.success) return pushError(c, 422, 'invalid_request', 'The body is not a push endpoint.');

		await db
			.delete(pushSubscriptions)
			.where(and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.endpoint, body.data.endpoint)));
		return c.body(null, 204);
	});
