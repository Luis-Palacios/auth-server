import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Client } from 'pg';
import { z } from 'zod';

// One-off migration runner: `node dist/migrate.js`, run as its own ECS task before each deploy (never
// on app startup). It deliberately doesn't import lib/config.ts, so the migrate task needs only
// DATABASE_URL, not the app's secrets.

const env = z
	.object({
		DATABASE_URL: z.string().min(1, 'DATABASE_URL must be set (see .env.example)'),
	})
	.safeParse(process.env);

if (!env.success) {
	throw new Error(`Invalid environment configuration:\n${z.prettifyError(env.error)}`);
}

// Any fixed number works; it only has to be the same for every migrate run against this database.
const MIGRATION_LOCK_KEY = 72_707_369;

// Resolved from this file (dist/migrate.js -> drizzle/), not from the working directory.
const migrationsFolder = fileURLToPath(new URL('../drizzle', import.meta.url));

// One connection, not a pool: an advisory lock belongs to the session that took it, so the lock,
// lock_timeout and the migrations must all run on the same connection.
const client = new Client({
	connectionString: env.data.DATABASE_URL,
	connectionTimeoutMillis: 5_000,
});

try {
	await client.connect();

	// Wait for any other migrate run to finish. This comes before lock_timeout is set, because
	// lock_timeout applies to advisory locks too and would turn this wait into an error.
	console.log('Waiting for migration lock...');
	await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_KEY]);

	// If a migration needs a table lock that a running query holds, fail instead of waiting: while
	// an ALTER TABLE waits for its lock, every new query on that table queues behind it.
	await client.query("SET lock_timeout = '10s'");

	console.log(`Applying migrations from ${migrationsFolder}...`);
	await migrate(drizzle({ client }), { migrationsFolder });
	console.log('Migrations are up to date.');
} catch (error) {
	console.error('Migration failed:', error);
	process.exitCode = 1;
} finally {
	// Closing the session also releases the advisory lock and rolls back an unfinished transaction.
	await client.end();
}
