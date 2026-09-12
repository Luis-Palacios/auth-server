import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { auth } from './lib/auth.js'; // path to your auth file
import { corsOrigins } from './lib/cors.js';

// BETTER_AUTH_URL is the single source of truth for the port: better-auth uses it
// for cookie domains, trusted-origin/CSRF checks, OAuth callbacks, and the JWKS
// issuer, so the port we listen on must always match the port in that URL.
if (!process.env.BETTER_AUTH_URL) {
	throw new Error('BETTER_AUTH_URL must be set (see .env.example)');
}
const authUrl = new URL(process.env.BETTER_AUTH_URL);
const port = Number(authUrl.port) || (authUrl.protocol === 'https:' ? 443 : 80);

const app = new Hono();
app.on(['POST', 'GET'], '/api/auth/*', (c) => auth.handler(c.req.raw));
app.use('*', cors({ origin: corsOrigins, credentials: true }));
console.log('Server is starting...');

serve(
	{
		fetch: app.fetch,
		port,
		// Bind all interfaces so Docker's port mapping can reach the process,
		// regardless of the hostname advertised in BETTER_AUTH_URL.
		hostname: '0.0.0.0',
	},
	(info) => {
		console.log(`Server is running on ${authUrl.origin} (listening on 0.0.0.0:${info.port})`);
	},
);
