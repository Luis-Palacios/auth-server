import { Server } from 'node:http'; // value import: used with instanceof
import { type HttpBindings, serve } from '@hono/node-server';
import { type Context, Hono } from 'hono';
import { cors } from 'hono/cors';
import { auth } from './lib/auth.js'; // path to your auth file
import { config } from './lib/config.js';
import { isShuttingDown, registerGracefulShutdown } from './lib/shutdown.js';
import { startNotificationSendsPurge } from './notifications/purge.js';
import { customAuthRoute } from './routes/custom-auth/index.js';
import { healthRoute } from './routes/health.js';
import { internalRoute } from './routes/internal/index.js';
import { pushRoute } from './routes/push/index.js';

const app = new Hono<{ Bindings: HttpBindings }>();

// Once shutdown starts, tell clients to close their keep-alive connection after this response.
// Otherwise server.close() waits for each busy socket to idle out (KEEP_ALIVE_TIMEOUT_MS, which is
// raised above the proxy's idle timeout in prod) and the grace period runs out before it returns.
app.use('*', async (c, next) => {
	await next();
	if (isShuttingDown()) c.header('Connection', 'close');
});

// Only mounted when CORS_ORIGINS lists a cross-origin browser client. Today there is none: the
// browser reaches /api/auth/* through staff-app's same-origin proxy (see src/lib/config.ts).
if (config.corsOrigins.length > 0) {
	app.use('*', cors({ origin: config.corsOrigins, credentials: true }));
}
app.route('/health', healthRoute);
app.route('/api/custom-auth', customAuthRoute);
app.route('/api/push', pushRoute);
app.route('/internal', internalRoute);
// The JWKS for service-to-service callers (membership-management's PyJWKClient), answered in-process
// so it skips better-auth's rate limiter. That limiter can't find a client IP for a call with no
// X-Forwarded-For, which only happens inside the VPC (the ALB always appends one), and it logs that
// only once per process. So without this, membership-management's first key fetch after each restart
// used up the one warning that should catch a staff-app call that lost the header (the shared-bucket
// bug, DEPLOYMENT-ROADMAP.md Phase 8). Requests carrying the header (browsers through staff-app's
// proxy) still go through the handler below and keep their per-IP limit. Same JSON either way.
app.get('/api/auth/.well-known/jwks.json', async (c, next) => {
	if (c.req.header('x-forwarded-for') !== undefined) return next();
	return c.json(await auth.api.getJwks());
});
app.on(['POST', 'GET'], '/api/auth/*', (c) => auth.handler(resolveAuthRequest(c)));

// better-auth's rate limiter keys requests by client IP, read from X-Forwarded-For (see
// @better-auth/core's getIP()). Whether that header can be believed depends on what sits in front:
//  - TRUSTED_PROXIES set: a known chain (ALB, Cloudflare, ...) appends to the header, and better-auth
//    walks it right to left, skipping those proxies, to find the real client. Pass the request through.
//  - TRUSTED_PROXIES empty: nothing trusted is in front, so a client connecting directly could send any
//    X-Forwarded-For it likes, a new value on every request, and bypass rate limiting entirely. We
//    overwrite it here with the real TCP peer address so it reflects who actually connected to us.
function resolveAuthRequest(c: Context<{ Bindings: HttpBindings }>): Request {
	// If there are trusted proxies, we assume the X-Forwarded-For header is trustworthy.
	if (config.trustedProxies.length > 0) return c.req.raw;

	const headers = new Headers(c.req.raw.headers);
	const remoteAddress = c.env.incoming.socket.remoteAddress;
	if (remoteAddress) {
		headers.set('x-forwarded-for', remoteAddress);
	} else {
		headers.delete('x-forwarded-for');
	}
	return new Request(c.req.raw, { headers });
}
if (config.isProduction && config.trustedProxies.length === 0) {
	console.warn(
		'TRUSTED_PROXIES is empty while NODE_ENV=production. If this service sits behind a load balancer or ' +
			'CDN, better-auth cannot resolve the real client IP and every user shares one rate-limit bucket per ' +
			'endpoint. Set TRUSTED_PROXIES to the proxy IP ranges (see .env.example), or ignore this if nothing ' +
			'trusted sits in front of this service.',
	);
}
console.log('Server is starting...');

const server = serve(
	{
		fetch: app.fetch,
		port: config.port,
		// Bind all interfaces so Docker's port mapping can reach the process,
		// regardless of the hostname advertised in BETTER_AUTH_URL.
		hostname: '0.0.0.0',
		// Bounds on the raw HTTP connection, independent of anything happening inside a
		// handler (e.g. a slow DB call - see Phase 3's DB_CONNECTION_TIMEOUT_MS for that).
		// Protects against a client that opens a connection and sends data slowly/never
		// finishes. keepAliveTimeoutMs in particular should be raised above the idle
		// timeout of any reverse proxy/load balancer put in front of this service, or the
		// proxy can race this server's socket close when reusing a keep-alive connection.
		serverOptions: {
			requestTimeout: config.requestTimeoutMs,
			headersTimeout: config.headersTimeoutMs,
			keepAliveTimeout: config.keepAliveTimeoutMs,
		},
	},
	(info) => {
		console.log(`Server is running on ${config.betterAuthUrl.origin} (listening on 0.0.0.0:${info.port})`);
	},
);

// serve() is typed to also return HTTP/2 servers, but we never pass createServer, so this is always
// node:http's Server. Check it rather than cast, so a future change fails loudly at startup.
if (!(server instanceof Server)) throw new Error('Expected serve() to return a node:http Server');
registerGracefulShutdown(server);
startNotificationSendsPurge();
