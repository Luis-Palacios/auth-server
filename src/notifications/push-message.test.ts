import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { reportReminderPushCopy, reportSubmittedPushCopy } from './push-copy.js';
import {
	encodePushMessage,
	MAX_PUSH_PLAINTEXT_BYTES,
	type PushMessage,
	PushMessageTooLargeError,
	toWebPushSubscription,
} from './push-message.js';

const base: Omit<PushMessage, 'title' | 'body'> = {
	path: '/groups/reports/812',
	tag: 'mm:notification-delivery:123',
	notificationId: 260,
	badgeCount: 2,
};

describe('push message', () => {
	it('encodes exactly the fields the service worker reads', () => {
		const json = encodePushMessage({ title: 'T', body: 'B', ...base });
		assert.deepEqual(JSON.parse(json), {
			title: 'T',
			body: 'B',
			path: '/groups/reports/812',
			tag: 'mm:notification-delivery:123',
			notificationId: 260,
			badgeCount: 2,
		});
	});

	it('keeps a null notificationId (in-app off)', () => {
		const json = encodePushMessage({ title: 'T', body: 'B', ...base, notificationId: null, badgeCount: 0 });
		assert.equal(JSON.parse(json).notificationId, null);
	});

	it('fits the worst case: 200-character names, Spanish, accents', () => {
		const long = 'Ñ'.repeat(200); // 2 bytes each in UTF-8
		const copy = reportSubmittedPushCopy(
			{
				submitterName: long,
				groupName: long,
				meetingDate: '2026-10-08',
				held: true,
				reason: 'watcher',
				attendedCount: 10_000,
				peopleCount: 10_000,
			},
			'es',
		);
		const json = encodePushMessage({ ...copy, ...base });
		assert.ok(Buffer.byteLength(json) < MAX_PUSH_PLAINTEXT_BYTES / 2);
	});

	it('fits a reminder for many groups', () => {
		const groups = Array.from({ length: 50 }, (_, i) => ({ name: `Grupo ${'x'.repeat(190)} ${i}`, hasDraft: false }));
		const copy = reportReminderPushCopy({ recipientName: 'Ana', groups, weekStart: '2026-11-22' }, 'es');
		assert.ok(Buffer.byteLength(encodePushMessage({ ...copy, ...base })) < MAX_PUSH_PLAINTEXT_BYTES);
	});

	it('measures bytes, not characters, and refuses what cannot fit', () => {
		const title = '€'.repeat(1400); // 1400 characters, 4200 bytes
		assert.throws(
			() => encodePushMessage({ title, body: '', ...base }),
			(error) => {
				assert.ok(error instanceof PushMessageTooLargeError);
				assert.ok(error.bytes > MAX_PUSH_PLAINTEXT_BYTES);
				return true;
			},
		);
	});

	it('maps a stored row to the subscription web-push takes', () => {
		assert.deepEqual(
			toWebPushSubscription({ endpoint: 'https://fcm.googleapis.com/fcm/send/abc', p256dh: 'P', auth: 'A' }),
			{
				endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
				keys: { p256dh: 'P', auth: 'A' },
			},
		);
	});
});
