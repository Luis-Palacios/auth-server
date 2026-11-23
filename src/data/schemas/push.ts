import { index, integer, pgTable, primaryKey, text, timestamp, varchar } from 'drizzle-orm/pg-core';
import { user } from './auth-schema.js';

// One row per browser/device a user turned notifications on for (Web Push, notifications spec
// rules 9, 10, 19). `endpoint` is the push service URL and identifies the device, so it is unique:
// registering an endpoint that exists moves it to the caller. Deleting the user deletes the rows.
export const pushSubscriptions = pgTable(
	'push_subscriptions',
	{
		id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		endpoint: text('endpoint').notNull().unique(),
		p256dh: text('p256dh').notNull(),
		auth: text('auth').notNull(),
		userAgent: varchar('user_agent', { length: 200 }),
		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
		lastUsedAt: timestamp('last_used_at', { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => [index('push_subscriptions_user_id_idx').on(table.userId)],
);

// Which subscription already got which delivery, so a retry doesn't push a device twice (rule 20).
// Cascades from the subscription: a deleted one (sign-out, dead endpoint, the 10 cap, a ban) takes
// its rows with it. Purged after 48 h with notification_sends.
export const pushSends = pgTable(
	'push_sends',
	{
		idempotencyKey: text('idempotency_key').notNull(),
		subscriptionId: integer('subscription_id')
			.notNull()
			.references(() => pushSubscriptions.id, { onDelete: 'cascade' }),
		status: text('status').$type<'sent'>().notNull().default('sent'),
		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => [
		primaryKey({ columns: [table.idempotencyKey, table.subscriptionId] }),
		index('push_sends_created_at_idx').on(table.createdAt),
		// The PK leads with the key; this serves the cascade when a subscription is deleted.
		index('push_sends_subscription_id_idx').on(table.subscriptionId),
	],
);
