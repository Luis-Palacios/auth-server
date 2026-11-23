import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import webpush, { type RequestOptions, WebPushError } from 'web-push';
import { PUSH_SOCKET_TIMEOUT_MS, PUSH_TTL_SECONDS, pushTopic, sendToDevice } from './push-send.js';

const subscription = { endpoint: 'https://fcm.googleapis.com/fcm/send/abc', keys: { p256dh: 'P', auth: 'A' } };
const keys = webpush.generateVAPIDKeys();
const vapid = { subject: 'mailto:test@example.org', ...keys };

describe('push topic', () => {
	it('is 32 URL-safe base64 characters', () => {
		const topic = pushTopic('mm:notification-delivery:123');
		assert.equal(topic.length, 32);
		assert.match(topic, /^[A-Za-z0-9_-]{32}$/);
	});

	it('is stable per key and differs between keys', () => {
		assert.equal(pushTopic('mm:notification-delivery:1'), pushTopic('mm:notification-delivery:1'));
		assert.notEqual(pushTopic('mm:notification-delivery:1'), pushTopic('mm:notification-delivery:2'));
	});
});

describe('sendToDevice', () => {
	it('sends with VAPID, a 24 h TTL, normal urgency, the topic and a socket timeout', async () => {
		let seen: RequestOptions | undefined;
		const answer = await sendToDevice(subscription, '{}', 'key-1', {
			vapid,
			send: async (_sub, _payload, options) => {
				seen = options;
				return { statusCode: 201, body: '', headers: {} };
			},
		});
		assert.deepEqual(answer, { kind: 'answered', status: 201 });
		assert.deepEqual(seen, {
			vapidDetails: vapid,
			TTL: PUSH_TTL_SECONDS,
			urgency: 'normal',
			topic: pushTopic('key-1'),
			timeout: PUSH_SOCKET_TIMEOUT_MS,
		});
	});

	it('turns a push service error back into its status', async () => {
		const answer = await sendToDevice(subscription, '{}', 'key-1', {
			vapid,
			send: async () => {
				throw new WebPushError('Received unexpected response code', 410, {}, '', subscription.endpoint);
			},
		});
		assert.deepEqual(answer, { kind: 'answered', status: 410 });
	});

	it('reports no answer as unreachable, with only the error code', async () => {
		const answer = await sendToDevice(subscription, '{}', 'key-1', {
			vapid,
			send: async () => {
				throw Object.assign(new Error('socket hang up at https://fcm…'), { code: 'ECONNRESET' });
			},
		});
		assert.deepEqual(answer, { kind: 'unreachable', reason: 'ECONNRESET' });
	});
});
