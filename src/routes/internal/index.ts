import { Hono } from 'hono';
import { requireInternalToken } from './auth.js';
import { notificationsRoute } from './notifications.js';

// Server-to-server routes, called only by membership-management. Never part of staff-app's
// /api/auth/* proxy. The token check runs before every sub-route; sub-routes are added below it.
export const internalRoute = new Hono().use('*', requireInternalToken).route('/notifications', notificationsRoute);
