import type { Server } from 'node:http';
import { pool } from '../data/database.js';
import { config } from './config.js';

let shuttingDown = false;

export function isShuttingDown(): boolean {
	return shuttingDown;
}

export function registerGracefulShutdown(server: Server): void {
	const shutdown = async (signal: NodeJS.Signals) => {
		if (shuttingDown) {
			console.warn(`Received ${signal} again, exiting immediately.`);
			process.exit(1);
		}

		shuttingDown = true;
		console.log(`Received ${signal}, shutting down (timeout ${config.shutdownTimeoutMs}ms)...`);

		setTimeout(() => {
			console.error('Graceful shutdown timed out, closing remaining connections.');
			server.closeAllConnections();
			process.exit(1);
		}, config.shutdownTimeoutMs);

		try {
			// Stops accepting connections and resolves once in-flight requests have finished.
			await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
			await pool.end();
			console.log('Shutdown complete.');
			process.exit(0);
		} catch (error) {
			console.error('Error during shutdown', error);
			process.exit(1);
		}
	};

	process.on('SIGTERM', shutdown);
	process.on('SIGINT', shutdown);
}
