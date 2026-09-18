import { desc, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { db } from '../../data/database.js';
import { invite, user } from '../../data/schemas/auth-schema.js';
import { auth } from '../../lib/auth.js';

// Not part of better-invite's own /invite/list endpoint on purpose: that endpoint hard-scopes
// results to `createdByUserId = session.user.id` (verified by reading its source - no config
// bypasses this), so an admin and an elder each only ever see invites they personally sent.
// This route exists to give admin/elder visibility across everyone's outstanding invites - a
// plain read against the invite table, joined to `user` for who sent each one. Cancelling still
// goes through better-invite's own /invite/cancel, which enforces creator-only regardless of role.
export const invitesRoute = new Hono().get('/', async (c) => {
	const session = await auth.api.getSession({ headers: c.req.raw.headers });
	if (!session) {
		return c.json({ error: 'Unauthorized' }, 401);
	}

	// Same check better-invite's own canCreateInvite uses internally (see auth.ts) - so "who can
	// view all invites" always matches "who can create one" with no separate statement to drift.
	const { success } = await auth.api.userHasPermission({
		headers: c.req.raw.headers,
		body: { permissions: { invites: ['create'] } },
	});
	if (!success) {
		return c.json({ error: 'Forbidden' }, 403);
	}

	const invites = await db
		.select({
			id: invite.id,
			token: invite.token,
			email: invite.email,
			emails: invite.emails,
			role: invite.role,
			status: invite.status,
			expiresAt: invite.expiresAt,
			createdAt: invite.createdAt,
			createdByUserId: invite.createdByUserId,
			inviterName: user.name,
			inviterEmail: user.email,
		})
		.from(invite)
		.leftJoin(user, eq(invite.createdByUserId, user.id))
		.orderBy(desc(invite.createdAt));

	return c.json({ invites });
});
