import { type HttpBindings, serve } from '@hono/node-server';
import { type Context, Hono } from 'hono';
import { cors } from 'hono/cors';
import { auth } from './lib/auth.js'; // path to your auth file
import { config } from './lib/config.js';
import { healthRoute } from './routes/health.js';

const app = new Hono<{ Bindings: HttpBindings }>();
app.use('*', cors({ origin: config.corsOrigins, credentials: true }));
app.route('/health', healthRoute);
app.on(['POST', 'GET'], '/api/auth/*', (c) => auth.handler(resolveAuthRequest(c)));

// better-auth's rate limiter keys requests by IP, trusting a single-value X-Forwarded-For
// header unconditionally (see @better-auth/core's getIP()). Since nothing sits in front of
// this service yet, a client connecting directly could set that header to a new value on every
// request and bypass rate limiting entirely. Until TRUST_PROXY=true (once a real reverse proxy
// is in place to set/overwrite this header itself before we see it), we overwrite it here with
// the real TCP peer address so it reflects who actually connected to us.
function resolveAuthRequest(c: Context<{ Bindings: HttpBindings }>): Request {
	if (config.trustProxy) return c.req.raw;

	const headers = new Headers(c.req.raw.headers);
	const remoteAddress = c.env.incoming.socket.remoteAddress;
	if (remoteAddress) {
		headers.set('x-forwarded-for', remoteAddress);
	} else {
		headers.delete('x-forwarded-for');
	}
	return new Request(c.req.raw, { headers });
}
console.log('Server is starting...');

serve(
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
