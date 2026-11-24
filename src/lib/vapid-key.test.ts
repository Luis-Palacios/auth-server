import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import webpush from 'web-push';
import { isVapidPair, isVapidPrivateKey, isVapidPublicKey } from './vapid-key.js';

describe('VAPID key checks', () => {
	const { publicKey, privateKey } = webpush.generateVAPIDKeys();

	it('accepts a freshly generated pair', () => {
		assert.equal(isVapidPublicKey(publicKey), true);
		assert.equal(isVapidPrivateKey(privateKey), true);
	});

	it('rejects the keys swapped', () => {
		assert.equal(isVapidPublicKey(privateKey), false);
		assert.equal(isVapidPrivateKey(publicKey), false);
	});

	it('rejects a truncated paste, padding and standard base64', () => {
		assert.equal(isVapidPublicKey(publicKey.slice(0, -2)), false);
		assert.equal(isVapidPrivateKey(`${privateKey}=`), false);
		const standard = Buffer.from(publicKey, 'base64url').toString('base64');
		if (standard.replace(/=+$/, '') !== publicKey) assert.equal(isVapidPublicKey(standard), false);
	});

	it('accepts the pair and rejects halves of different pairs', () => {
		const other = webpush.generateVAPIDKeys();
		assert.equal(isVapidPair(publicKey, privateKey), true);
		assert.equal(isVapidPair(publicKey, other.privateKey), false);
		assert.equal(isVapidPair(other.publicKey, privateKey), false);
	});

	it('rejects a private key outside the curve range', () => {
		const zero = Buffer.alloc(32).toString('base64url');
		assert.equal(isVapidPair(publicKey, zero), false);
	});

	it('rejects a 65-byte value that is not an uncompressed point', () => {
		const bytes = Buffer.from(publicKey, 'base64url');
		bytes[0] = 0x02;
		assert.equal(isVapidPublicKey(bytes.toString('base64url')), false);
	});
});
