import { APIError, createAuthMiddleware, getAuthoritativeSessionFromCtx } from 'better-auth/api';
import { permissionsFor } from '../permissions/statements.js';

// user-admin-actions spec, rules 5-7. better-auth's admin plugin only checks `user: set-role` and
// `user: ban`, so on its own an elder could promote someone to admin, ban an admin, or change their
// own role. This runs before those endpoints, so it holds for any caller, not just staff-app.
const GUARDED_PATHS = new Set([
	'/admin/set-role',
	'/admin/ban-user',
	'/admin/unban-user',
	'/admin/create-user',
	'/invite/create',
]);

// A user's `role` can be a comma-separated list; it is an admin account if any of them is.
function isAdminAccountRole(role: unknown): boolean {
	const names = Array.isArray(role) ? role : typeof role === 'string' ? role.split(',') : [];
	return names.some((name) => permissionsFor(String(name).trim()).adminAccounts?.includes('manage') ?? false);
}

export const adminGuard = createAuthMiddleware(async (ctx) => {
	if (!GUARDED_PATHS.has(ctx.path)) return;

	const session = await getAuthoritativeSessionFromCtx(ctx);
	// No session: an in-process call (scripts) or an unauthenticated one the endpoint itself rejects.
	if (!session) return;

	const body = (ctx.body ?? {}) as { userId?: string; role?: unknown; data?: { role?: unknown } };

	// Nobody changes their own role, admins included (rule 6).
	if (ctx.path === '/admin/set-role' && body.userId === session.user.id) {
		throw APIError.from('BAD_REQUEST', {
			code: 'YOU_CANNOT_CHANGE_YOUR_OWN_ROLE',
			message: 'You cannot change your own role',
		});
	}

	if (isAdminAccountRole(session.user.role)) return;

	if (ctx.path === '/admin/create-user' || ctx.path === '/invite/create') {
		if (isAdminAccountRole(body.role ?? body.data?.role)) {
			throw APIError.from('FORBIDDEN', {
				code: 'YOU_CANNOT_ASSIGN_ADMIN_ROLE',
				message: 'Only an admin can create an admin account or invite one',
			});
		}
		return;
	}

	if (ctx.path === '/admin/set-role' && isAdminAccountRole(body.role)) {
		throw APIError.from('FORBIDDEN', {
			code: 'YOU_CANNOT_ASSIGN_ADMIN_ROLE',
			message: 'Only an admin can assign the admin role',
		});
	}

	if (!body.userId) return;
	const target = await ctx.context.internalAdapter.findUserById(body.userId);
	if (target && isAdminAccountRole((target as { role?: string | null }).role)) {
		throw APIError.from('FORBIDDEN', {
			code: 'YOU_CANNOT_MANAGE_ADMIN_ACCOUNTS',
			message: 'Only an admin can manage an admin account',
		});
	}
});
