import assert from 'node:assert/strict';
import { createECDH, randomBytes } from 'node:crypto';
import { describe, it } from 'node:test';
import { isAllowedPushEndpoint, subscribeBody } from './push-input.js';

describe('isAllowedPushEndpoint', () => {
	const allowed = [
		'https://fcm.googleapis.com/fcm/send/abc',
		'https://updates.push.services.mozilla.com/wpush/v2/abc',
		'https://db5p.notify.windows.com/?token=abc',
		'https://web.push.apple.com/abc',
		'https://api.push.apple.com/3/device/abc',
		// Mixed case and percent-encoding in the path are left alone (href is unchanged).
		'https://fcm.googleapis.com/fcm/send/AbC-_%7E123',
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
		'percent-encoded dot in host': 'https://evil.com%2E.push.apple.com/x',
		'percent-encoded dot, lowercase': 'https://evil.com%2e.push.apple.com/x',
		'trailing encoded dot': 'https://fcm.googleapis.com%2E/x',
		'encoded dot before suffix': 'https://evil%2Epush.apple.com/x',
		'empty label': 'https://evil..push.apple.com/x',
		'uppercase host (not normalized)': 'https://FCM.googleapis.com/fcm/send/abc',
		'explicit default port (not normalized)': 'https://fcm.googleapis.com:443/fcm/send/abc',
		'dot segment (not normalized)': 'https://fcm.googleapis.com/a/../b',
		'backslash (not normalized)': 'https://fcm.googleapis.com\\@evil.com/x',
		'too long': `https://fcm.googleapis.com/${'a'.repeat(2100)}`,
	};
	for (const [name, endpoint] of Object.entries(rejected)) {
		it(`rejects ${name}`, () => assert.equal(isAllowedPushEndpoint(endpoint), false));
	}
});

describe('subscribeBody', () => {
	// What a browser sends: its P-256 public key and a 16-byte secret.
	const ecdh = createECDH('prime256v1');
	ecdh.generateKeys();
	const p256dh = ecdh.getPublicKey('base64url', 'uncompressed');
	const auth = randomBytes(16).toString('base64url');
	const endpoint = 'https://fcm.googleapis.com/fcm/send/abc';

	it('accepts a browser subscription', () => {
		assert.ok(subscribeBody.safeParse({ endpoint, keys: { p256dh, auth } }).success);
	});

	// 65 bytes with the 0x04 marker, but X and Y aren't a point on the curve.
	const offCurve = Buffer.concat([Buffer.from([0x04]), Buffer.alloc(64, 1)]).toString('base64url');
	const invalid: Record<string, unknown> = {
		'no keys': { endpoint },
		'padded auth': { endpoint, keys: { p256dh, auth: `${auth}==` } },
		'standard base64 key': { endpoint, keys: { p256dh: `${p256dh.slice(0, -1)}+`, auth } },
		'short p256dh': { endpoint, keys: { p256dh: 'abc', auth } },
		'60-byte p256dh': { endpoint, keys: { p256dh: randomBytes(60).toString('base64url'), auth } },
		'p256dh off the curve': { endpoint, keys: { p256dh: offCurve, auth } },
		'12-byte auth': { endpoint, keys: { p256dh, auth: randomBytes(12).toString('base64url') } },
		'long auth': { endpoint, keys: { p256dh, auth: 'a'.repeat(200) } },
		'endpoint not a string': { endpoint: 1, keys: { p256dh, auth } },
	};
	for (const [name, body] of Object.entries(invalid)) {
		it(`rejects ${name}`, () => assert.equal(subscribeBody.safeParse(body).success, false));
	}
});
