import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../data/database.js';
import { pushSends, pushSubscriptions } from '../data/schemas/push.js';
import { pushCopyFor } from './push-copy.js';
import { encodePushMessage } from './push-message.js';
import { judgeDevice, judgeRequest, type PushVerdict } from './push-outcome.js';
import { type DeviceAnswer, sendToDevice } from './push-send.js';
import { vapidDetails } from './push-vapid.js';
import { findRecipient } from './recipient.js';

// One push delivery from membership-management, sent to every device of its recipient (notifications
// spec rule 20, *The fan-out and its outcome*).

// membership-management gives up on the whole request after 5 s. The devices are sent in parallel and
// we stop waiting at 4 s, leaving time for the database writes and the response. A device still
// pending then counts as transient: the retry skips the ones already recorded in push_sends. If its
// request completes later anyway, the duplicate is replaced (Topic at the push service, tag on screen).
export const FANOUT_DEADLINE_MS = 4_000;

export type PushDelivery = {
	idempotencyKey: string;
	recipientUserId: string;
	template: string;
	data: unknown; // already validated by the template
	path: string;
	notificationId: number | null;
	badgeCount: number;
};

export type FanoutResult = PushVerdict | { outcome: 'recipient_unavailable' } | { outcome: 'no_copy' };

function withDeadline(
	answer: Promise<DeviceAnswer>,
	deadline: Promise<'deadline'>,
): Promise<DeviceAnswer | 'deadline'> {
	return Promise.race([answer, deadline]);
}

export async function fanOutPush(delivery: PushDelivery): Promise<FanoutResult> {
	// The same recipient rules as email: exists, verified, not banned. A ban also deleted their
	// subscriptions (rule 9); this covers a ban whose cleanup failed.
	const recipient = await findRecipient(delivery.recipientUserId);
	if (!recipient) return { outcome: 'recipient_unavailable' };

	const copy = pushCopyFor(delivery.template, delivery.data, recipient.locale);
	if (!copy) return { outcome: 'no_copy' };
	// Same bytes for every device (each gets its own encryption). Throws PushMessageTooLargeError: a bug.
	const payload = encodePushMessage({
		...copy,
		path: delivery.path,
		tag: delivery.idempotencyKey,
		notificationId: delivery.notificationId,
		badgeCount: delivery.badgeCount,
	});

	const subscriptions = await db
		.select()
		.from(pushSubscriptions)
		.where(eq(pushSubscriptions.userId, delivery.recipientUserId));
	const alreadySent = new Set(
		subscriptions.length === 0
			? []
			: (
					await db
						.select({ subscriptionId: pushSends.subscriptionId })
						.from(pushSends)
						.where(
							and(
								eq(pushSends.idempotencyKey, delivery.idempotencyKey),
								inArray(
									pushSends.subscriptionId,
									subscriptions.map((s) => s.id),
								),
							),
						)
				).map((row) => row.subscriptionId),
	);
	const pending = subscriptions.filter((s) => !alreadySent.has(s.id));

	let timer: NodeJS.Timeout | undefined;
	const deadline = new Promise<'deadline'>((resolve) => {
		timer = setTimeout(() => resolve('deadline'), FANOUT_DEADLINE_MS);
	});
	let answers: (DeviceAnswer | 'deadline')[];
	try {
		answers = await Promise.all(
			pending.map((s) =>
				withDeadline(
					sendToDevice(
						{ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
						payload,
						delivery.idempotencyKey,
						{ vapid: vapidDetails },
					),
					deadline,
				),
			),
		);
	} finally {
		clearTimeout(timer);
	}

	const counts = { sent: 0, alreadySent: alreadySent.size, transient: 0 };
	const sentIds: number[] = [];
	const goneIds: number[] = [];
	pending.forEach((subscription, index) => {
		const answer = answers[index] ?? 'deadline';
		const verdict = judgeDevice(answer);
		if (verdict === 'sent') sentIds.push(subscription.id);
		else if (verdict === 'gone') goneIds.push(subscription.id);
		else if (verdict === 'transient') counts.transient += 1;
		else {
			// Our request is wrong (400, 413, or 401/403: VAPID doesn't match the subscription's key).
			const status = answer !== 'deadline' && answer.kind === 'answered' ? answer.status : '?';
			console.error(`Push ${delivery.idempotencyKey}: push service rejected it (${status}), skipped that device`);
		}
	});
	counts.sent = sentIds.length;

	if (sentIds.length > 0) {
		await db.transaction(async (tx) => {
			await tx
				.insert(pushSends)
				.values(sentIds.map((subscriptionId) => ({ idempotencyKey: delivery.idempotencyKey, subscriptionId })))
				.onConflictDoNothing();
			await tx.update(pushSubscriptions).set({ lastUsedAt: new Date() }).where(inArray(pushSubscriptions.id, sentIds));
		});
	}
	// Only the recipient's own rows: an endpoint moved to someone else since we read it keeps working.
	if (goneIds.length > 0) {
		await db
			.delete(pushSubscriptions)
			.where(and(inArray(pushSubscriptions.id, goneIds), eq(pushSubscriptions.userId, delivery.recipientUserId)));
	}

	return judgeRequest(counts);
}
