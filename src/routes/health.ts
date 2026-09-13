import { sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { db, pool } from '../data/database.js';
import { config } from '../lib/config.js';

// Debounces the actual `select 1` so a burst of /health calls (e.g. a flood, or just an
// aggressive orchestrator polling interval) collapses into one real query against the pool
// instead of one per request. Pool stats below are still read fresh every time - they're a
// synchronous property read on the pool object, not a query, so there's nothing to debounce there.
const DB_CHECK_CACHE_MS = 1000;
let cachedDbCheck: { result: 'up' | 'down'; expiresAt: number } | null = null;
let inFlightDbCheck: Promise<'up' | 'down'> | null = null;

async function checkDatabase(): Promise<'up' | 'down'> {
	const now = Date.now();
	if (cachedDbCheck && cachedDbCheck.expiresAt > now) return cachedDbCheck.result;

	if (!inFlightDbCheck) {
		inFlightDbCheck = (async () => {
			try {
				await db.execute(sql`select 1`);
				return 'up' as const;
			} catch (error) {
				console.error('Health check: DB query failed', error);
				return 'down' as const;
			}
		})().finally(() => {
			inFlightDbCheck = null;
		});
	}

	const result = await inFlightDbCheck;
	cachedDbCheck = { result, expiresAt: Date.now() + DB_CHECK_CACHE_MS };
	return result;
}

export const healthRoute = new Hono().get('/', async (c) => {
	const dbStatus = await checkDatabase();
	const poolStatus = {
		total: pool.totalCount,
		idle: pool.idleCount,
		waiting: pool.waitingCount,
		max: config.dbPoolMax,
	};

	if (dbStatus === 'up') return c.json({ status: 'ok', db: 'up', pool: poolStatus });
	return c.json({ status: 'error', db: 'down', pool: poolStatus }, 503);
});
