import { type HttpBindings, serve } from '@hono/node-server';
import { type Context, Hono } from 'hono';
import { cors } from 'hono/cors';
import { auth } from './lib/auth.js'; // path to your auth file
import { config } from './lib/config.js';
import { customAuthRoute } from './routes/custom-auth/index.js';
import { healthRoute } from './routes/health.js';

const app = new Hono<{ Bindings: HttpBindings }>();
app.use('*', cors({ origin: config.corsOrigins, credentials: true }));
app.route('/health', healthRoute);
app.route('/api/custom-auth', customAuthRoute);
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
