import { serve } from '@hono/node-server';
import { sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { db, pool } from './data/database.js';
import { auth } from './lib/auth.js'; // path to your auth file
import { config } from './lib/config.js';

const app = new Hono();
app.use('*', cors({ origin: config.corsOrigins, credentials: true }));
app.get('/health', async (c) => {
	// Read pool stats after the query, not before: totalCount/idleCount only reflect the
	// connection this check itself just used (or attempted) once the await settles.
	const poolStatus = () => ({
		total: pool.totalCount,
		idle: pool.idleCount,
		waiting: pool.waitingCount,
		max: config.dbPoolMax,
	});

	try {
		await db.execute(sql`select 1`);
		return c.json({ status: 'ok', db: 'up', pool: poolStatus() });
	} catch (error) {
		console.error('Health check: DB query failed', error);
		return c.json({ status: 'error', db: 'down', pool: poolStatus() }, 503);
	}
});
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
