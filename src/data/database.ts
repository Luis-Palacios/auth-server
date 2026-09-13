import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { config } from '../lib/config.js';

// node-postgres's own defaults are max: 10, idleTimeoutMillis: 10000, and no
// connectionTimeoutMillis at all (i.e. an acquire can hang forever) - we keep the first two
// but always set a connection timeout so a stale/unreachable DB fails requests instead of
// hanging them.
// Built explicitly (rather than via drizzle's `connection` shorthand) so we have a directly
// typed handle to read pool stats (totalCount/idleCount/waitingCount) from, e.g. for /health.
const pool = new Pool({
	connectionString: config.databaseUrl,
	max: config.dbPoolMax,
	idleTimeoutMillis: config.dbIdleTimeoutMs,
	connectionTimeoutMillis: config.dbConnectionTimeoutMs,
});

const db: NodePgDatabase = drizzle({ client: pool });

export { db, pool };
