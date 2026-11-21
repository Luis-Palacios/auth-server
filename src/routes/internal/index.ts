import { Hono } from 'hono';
import { internalError, requireInternalToken } from './auth.js';
import { notificationsRoute } from './notifications.js';
import { usersRoute } from './users.js';

// Server-to-server routes, called only by membership-management. Never part of staff-app's
// /api/auth/* proxy. The token check runs before every sub-route; sub-routes are added below it.
export const internalRoute = new Hono()
	.use('*', requireInternalToken)
	.route('/notifications', notificationsRoute)
	.route('/users', usersRoute)
	// Anything that throws (a database error, a bug) still answers in the { code, message } shape, so
	// membership-management logs a code instead of Hono's bare "Internal Server Error". Never put
	// error.message in the body: it can contain SQL or values from the database.
	.onError((error, c) => {
		console.error(`Internal route ${c.req.method} ${c.req.path} failed`, error);
		return internalError(c, 500, 'internal_error', 'Unexpected error.');
	});
