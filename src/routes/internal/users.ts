import { and, eq, inArray, isNull, lte, or } from 'drizzle-orm';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { z } from 'zod';
import { db } from '../../data/database.js';
import { user } from '../../data/schemas/auth-schema.js';
import { isKnownPermission, permissionsFor, rolesWithAll } from '../../permissions/statements.js';
import { internalError } from './auth.js';

const MAX_PERMISSIONS = 20;
const MAX_USER_IDS = 500;

const permissionsRequest = z.strictObject({
	userIds: z.array(z.string().min(1).max(200)).min(1).max(MAX_USER_IDS),
});

// Users who can act: never banned, or banned with a ban that has run out (better-auth lets them sign
// in again then). auth-server has no separate "deactivated" state: a ban is it.
function notBanned() {
	return or(isNull(user.banned), eq(user.banned, false), lte(user.banExpires, new Date()));
}

export const usersRoute = new Hono()
	.get('/with-permission', async (c) => {
		// ?permission=smallGroups:all&permission=… — the user must hold all of them.
		const names = c.req.queries('permission') ?? [];
		if (names.length === 0 || names.length > MAX_PERMISSIONS) {
			return internalError(
				c,
				422,
				'invalid_permission',
				`Give 1 to ${MAX_PERMISSIONS} permission=resource:action values.`,
			);
		}
		const unknown = names.find((name) => !isKnownPermission(name));
		if (unknown !== undefined) {
			return internalError(c, 422, 'invalid_permission', `Unknown permission "${unknown.slice(0, 100)}".`);
		}

		// Permissions → roles in code (statements.ts), then one indexed query for users with those roles.
		const matchingRoles = rolesWithAll(names);
		if (matchingRoles.length === 0) return c.json({ userIds: [] });

		const rows = await db
			.select({ id: user.id })
			.from(user)
			.where(and(inArray(user.role, matchingRoles), notBanned()))
			.orderBy(user.id);
		return c.json({ userIds: rows.map((row) => row.id) });
	})
	.post(
		'/permissions',
		// 500 ids of ~32 characters is ~20 KB; anything far beyond that isn't a real request.
		bodyLimit({
			maxSize: 64 * 1024,
			onError: (c) => internalError(c, 422, 'invalid_request', 'The request body is too large.'),
		}),
		async (c) => {
			const body = permissionsRequest.safeParse(await c.req.json().catch(() => undefined));
			if (!body.success) {
				return internalError(c, 422, 'invalid_request', `Send { "userIds": [...] } with 1 to ${MAX_USER_IDS} ids.`);
			}
			const ids = [...new Set(body.data.userIds)];

			const rows = await db
				.select({ id: user.id, role: user.role })
				.from(user)
				.where(and(inArray(user.id, ids), notBanned()));

			// Same shape as the JWT's `perms`, from the same function. Unknown and banned users are absent,
			// which the caller reads as "can't read". fromEntries makes own properties, so no id can touch
			// the object's prototype.
			const users = Object.fromEntries(rows.map((row) => [row.id, permissionsFor(row.role)]));
			return c.json({ users });
		},
	);
