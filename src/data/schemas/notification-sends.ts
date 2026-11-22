import { sql } from 'drizzle-orm';
import { check, index, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

// Exactly what we hand to resend.emails.send, stored before the first attempt so a retry sends the
// same bytes (Resend rejects a reused idempotency key with a different body).
export type StoredResendRequest = { from: string; to: string; subject: string; html: string; text: string };

// One row per idempotency key from membership-management: what auth-server is about to send, or
// sent, for that key. Rendered once; retries reuse resend_request. Purged after 48 h (longer than
// Resend keeps keys and than a delivery lives). No FK to user: the row is a short-lived send record
// whose lifetime is the purge, not the user's.
export const notificationSends = pgTable(
	'notification_sends',
	{
		idempotencyKey: text('idempotency_key').primaryKey(),
		recipientUserId: text('recipient_user_id').notNull(),
		template: text('template').notNull(),
		requestHash: text('request_hash').notNull(),
		toAddress: text('to_address').notNull(),
		locale: text('locale').notNull(),
		resendRequest: jsonb('resend_request').$type<StoredResendRequest>().notNull(),
		resendEmailId: text('resend_email_id'),
		status: text('status').$type<'pending' | 'sent'>().notNull().default('pending'),
		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp('updated_at', { withTimezone: true })
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull(),
	},
	(table) => [
		index('notification_sends_created_at_idx').on(table.createdAt),
		check('notification_sends_status_check', sql`${table.status} in ('pending', 'sent')`),
	],
);
