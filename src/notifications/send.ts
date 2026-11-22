import { eq } from 'drizzle-orm';
import { render } from 'react-email';
import { db } from '../data/database.js';
import { notificationSends, type StoredResendRequest } from '../data/schemas/notification-sends.js';
import { config } from '../lib/config.js';
import { emailFrom, resend } from '../lib/emails.js';
import { findRecipient } from './recipient.js';
import type { RenderContext, RenderedEmail } from './templates.js';

type StoredSend = typeof notificationSends.$inferSelect;

export type NotificationRequest = {
	idempotencyKey: string;
	recipientUserId: string;
	template: string;
	path: string;
	requestHash: string;
	render: (context: RenderContext) => RenderedEmail;
};

async function findStoredSend(idempotencyKey: string): Promise<StoredSend | undefined> {
	const [row] = await db
		.select()
		.from(notificationSends)
		.where(eq(notificationSends.idempotencyKey, idempotencyKey))
		.limit(1);
	return row;
}

// The send row for this key, created on the first attempt: recipient looked up, email rendered in
// their language and stored before anything goes to Resend. Later attempts get that row back as is,
// so a retry sends the same bytes even if the address, language or template changed in between.
// null = the recipient can't receive email (only asked on the first attempt).
async function findOrCreateStoredSend(request: NotificationRequest): Promise<StoredSend | null> {
	const existing = await findStoredSend(request.idempotencyKey);
	if (existing) return existing;

	const recipient = await findRecipient(request.recipientUserId);
	if (!recipient) return null;

	const { subject, react } = request.render({
		url: `${config.staffAppUrl}${request.path}`,
		locale: recipient.locale,
	});
	const [html, text] = await Promise.all([render(react), render(react, { plainText: true })]);
	const resendRequest: StoredResendRequest = { from: emailFrom, to: recipient.email, subject, html, text };

	// Two first attempts at once: both render, one insert wins, and both read back the winner's row,
	// so whatever they send is identical.
	await db
		.insert(notificationSends)
		.values({
			idempotencyKey: request.idempotencyKey,
			recipientUserId: request.recipientUserId,
			template: request.template,
			requestHash: request.requestHash,
			toAddress: recipient.email,
			locale: recipient.locale,
			resendRequest,
		})
		.onConflictDoNothing();
	const stored = await findStoredSend(request.idempotencyKey);
	if (!stored) throw new Error('notification_sends row missing right after insert');
	return stored;
}

// What happened, in the route's terms; the route turns it into a status code and error `code`.
export type SendResult =
	| { outcome: 'sent'; emailId: string }
	| { outcome: 'recipient_unavailable' }
	| { outcome: 'idempotency_conflict' }
	| { outcome: 'send_failed'; reason: string };

// Sends the stored request for this key, at most once as far as the recipient can tell: Resend
// recognises the key for 24 h and answers a repeat with the original email instead of sending again.
export async function sendNotification(request: NotificationRequest): Promise<SendResult> {
	const stored = await findOrCreateStoredSend(request);
	if (!stored) return { outcome: 'recipient_unavailable' };
	if (stored.requestHash !== request.requestHash) return { outcome: 'idempotency_conflict' };
	if (stored.status === 'sent' && stored.resendEmailId) {
		return { outcome: 'sent', emailId: stored.resendEmailId };
	}

	let response: Awaited<ReturnType<typeof resend.emails.send>>;
	try {
		response = await resend.emails.send(stored.resendRequest, { idempotencyKey: request.idempotencyKey });
	} catch (error) {
		// Network failure, DNS, a bug in the SDK. Resend may or may not have sent it; retrying is safe
		// either way, because the retry sends the same stored body with the same idempotency key.
		return { outcome: 'send_failed', reason: error instanceof Error ? error.name : 'unknown' };
	}

	const { data, error } = response;
	if (error) {
		// Same key, different body at Resend: can only happen if a row was purged and the key reused.
		if (error.name === 'invalid_idempotent_request') return { outcome: 'idempotency_conflict' };
		// Everything else (rate limit, concurrent request with this key, 5xx, a config problem such
		// as an unverified sender) is retried by membership-management until its 24 h expiry.
		return { outcome: 'send_failed', reason: error.name };
	}

	await db
		.update(notificationSends)
		.set({ status: 'sent', resendEmailId: data.id })
		.where(eq(notificationSends.idempotencyKey, request.idempotencyKey));
	return { outcome: 'sent', emailId: data.id };
}
