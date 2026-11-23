import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isAllowedPushEndpoint, subscribeBody } from './push-input.js';

describe('isAllowedPushEndpoint', () => {
	const allowed = [
		'https://fcm.googleapis.com/fcm/send/abc',
		'https://updates.push.services.mozilla.com/wpush/v2/abc',
		'https://db5p.notify.windows.com/?token=abc',
		'https://web.push.apple.com/abc',
		'https://api.push.apple.com/3/device/abc',
		'https://FCM.googleapis.com/fcm/send/abc',
		'https://fcm.googleapis.com:443/fcm/send/abc',
	];
	for (const endpoint of allowed) {
		it(`accepts ${endpoint}`, () => assert.equal(isAllowedPushEndpoint(endpoint), true));
	}

	const rejected: Record<string, string> = {
		http: 'http://fcm.googleapis.com/fcm/send/abc',
		'other host': 'https://example.com/push',
		'suffix without a dot': 'https://evilpush.apple.com/abc',
		'bare suffix domain': 'https://push.services.mozilla.com/abc',
		'prefix lookalike': 'https://fcm.googleapis.com.evil.com/abc',
		userinfo: 'https://user:pw@fcm.googleapis.com/abc',
		'userinfo trick': 'https://fcm.googleapis.com@evil.com/abc',
		'other port': 'https://fcm.googleapis.com:8443/abc',
		'trailing dot': 'https://fcm.googleapis.com./abc',
		'not a URL': 'fcm.googleapis.com/abc',
		empty: '',
		localhost: 'https://localhost/abc',
		'ip address': 'https://127.0.0.1/abc',
		'too long': `https://fcm.googleapis.com/${'a'.repeat(2100)}`,
	};
	for (const [name, endpoint] of Object.entries(rejected)) {
		it(`rejects ${name}`, () => assert.equal(isAllowedPushEndpoint(endpoint), false));
	}
});

describe('subscribeBody', () => {
	const p256dh = 'B'.repeat(87);
	const auth = 'a'.repeat(22);
	const endpoint = 'https://fcm.googleapis.com/fcm/send/abc';

	it('accepts a browser subscription', () => {
		assert.ok(subscribeBody.safeParse({ endpoint, keys: { p256dh, auth } }).success);
	});

	const invalid: Record<string, unknown> = {
		'no keys': { endpoint },
		'padded auth': { endpoint, keys: { p256dh, auth: `${'a'.repeat(22)}==` } },
		'standard base64 key': { endpoint, keys: { p256dh: `${'B'.repeat(86)}+`, auth } },
		'short p256dh': { endpoint, keys: { p256dh: 'abc', auth } },
		'long auth': { endpoint, keys: { p256dh, auth: 'a'.repeat(200) } },
		'endpoint not a string': { endpoint: 1, keys: { p256dh, auth } },
	};
	for (const [name, body] of Object.entries(invalid)) {
		it(`rejects ${name}`, () => assert.equal(subscribeBody.safeParse(body).success, false));
	}
});
