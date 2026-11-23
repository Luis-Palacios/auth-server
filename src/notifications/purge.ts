import { lt, sql } from 'drizzle-orm';
import { db } from '../data/database.js';
import { notificationSends } from '../data/schemas/notification-sends.js';
import { pushSends } from '../data/schemas/push.js';

const PURGE_EVERY_MS = 60 * 60 * 1000; // hourly
const FIRST_PURGE_AFTER_MS = 60 * 1000; // a minute after start, off the startup path

// 48 h is longer than Resend keeps idempotency keys (24 h) and than a delivery lives (24 h, its
// expiry in membership-management), so no retry can need a row this deletes. The cutoff is the
// database's now(), not this process's clock. Idempotent: several instances running it is harmless.
export async function purgeOldNotificationSends(): Promise<number> {
	const result = await db
		.delete(notificationSends)
		.where(lt(notificationSends.createdAt, sql`now() - interval '48 hours'`));
	return result.rowCount ?? 0;
}

// Same 48 h and same reasoning as above: a push delivery lives 24 h.
export async function purgeOldPushSends(): Promise<number> {
	const result = await db.delete(pushSends).where(lt(pushSends.createdAt, sql`now() - interval '48 hours'`));
	return result.rowCount ?? 0;
}

async function runPurge(): Promise<void> {
	try {
		const purged = await purgeOldNotificationSends();
		if (purged > 0) console.log(`Purged ${purged} notification sends older than 48 h`);
	} catch (error) {
		console.error('Purging notification sends failed', error);
	}
	// Separate try so a failure in one table never skips the other.
	try {
		const purged = await purgeOldPushSends();
		if (purged > 0) console.log(`Purged ${purged} push sends older than 48 h`);
	} catch (error) {
		console.error('Purging push sends failed', error);
	}
}

let firstRun: NodeJS.Timeout | undefined;
let interval: NodeJS.Timeout | undefined;

// unref(): the timers never keep the process alive on their own. shutdown.ts calls the stop function.
export function startNotificationSendsPurge(): void {
	if (interval) return;
	firstRun = setTimeout(runPurge, FIRST_PURGE_AFTER_MS).unref();
	interval = setInterval(runPurge, PURGE_EVERY_MS).unref();
}

export function stopNotificationSendsPurge(): void {
	clearTimeout(firstRun);
	clearInterval(interval);
	firstRun = undefined;
	interval = undefined;
}
