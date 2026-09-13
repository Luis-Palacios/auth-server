import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { auth } from './lib/auth.js'; // path to your auth file
import { config } from './lib/config.js';

const app = new Hono();
app.use('*', cors({ origin: config.corsOrigins, credentials: true }));
app.get('/health', (c) => c.json({ status: 'ok' }));
app.on(['POST', 'GET'], '/api/auth/*', (c) => auth.handler(c.req.raw));
console.log('Server is starting...');

serve(
	{
		fetch: app.fetch,
		port: config.port,
		// Bind all interfaces so Docker's port mapping can reach the process,
		// regardless of the hostname advertised in BETTER_AUTH_URL.
		hostname: '0.0.0.0',
	},
	(info) => {
		console.log(`Server is running on ${config.betterAuthUrl.origin} (listening on 0.0.0.0:${info.port})`);
	},
);
