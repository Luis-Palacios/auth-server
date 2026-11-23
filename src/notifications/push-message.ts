import type { PushSubscription } from 'web-push';
import type { pushSubscriptions } from '../data/schemas/push.js';
import type { PushCopy } from './push-copy.js';

// What the service worker receives in its `push` event, as JSON (notifications spec, *Contracts
// (Part 2) → auth-server*). The push service relays it but can't read it: web-push encrypts it for one
// browser (RFC 8291, aes128gcm) with that browser's `p256dh` key and `auth` secret.
//
// - title, body: the push copy, in the recipient's language; the OS shows the app's name above them.
// - path: where the app opens when there is no in-app entry (in-app off).
// - tag: the delivery's idempotency key. A notification with a tag already on screen replaces it, so a
//   retried delivery never stacks a second copy (rule 20).
// - notificationId: the in-app entry; a click opens /notifications/open/{id}, which marks it read
//   (rule 15). Null while in-app is off.
// - badgeCount: the unread count for the app icon badge (rule 17).
export type PushMessage = PushCopy & {
	path: string;
	tag: string;
	notificationId: number | null;
	badgeCount: number;
};

// A push body is at most 4096 bytes once encrypted. aes128gcm adds an 86-byte header (16-byte salt,
// 4-byte record size, 1-byte key-id length, the 65-byte ephemeral public key), a 16-byte GCM tag and a
// 1-byte padding delimiter, which leaves 4096 - 86 - 16 - 1 = 3993 bytes of plaintext.
export const MAX_PUSH_PLAINTEXT_BYTES = 3993;

export class PushMessageTooLargeError extends Error {
	constructor(readonly bytes: number) {
		super(`Push message is ${bytes} bytes, over the ${MAX_PUSH_PLAINTEXT_BYTES}-byte limit`);
		this.name = 'PushMessageTooLargeError';
	}
}

// The exact plaintext web-push encrypts. Throws PushMessageTooLargeError when it can't fit: our copy is
// short and names are capped at 200 characters, so that is a bug to log, never something to retry.
export function encodePushMessage(message: PushMessage): string {
	const json = JSON.stringify(message);
	const bytes = Buffer.byteLength(json, 'utf8');
	if (bytes > MAX_PUSH_PLAINTEXT_BYTES) throw new PushMessageTooLargeError(bytes);
	return json;
}

// A stored row as web-push wants it: the push service URL plus the browser's two keys.
type StoredSubscription = Pick<typeof pushSubscriptions.$inferSelect, 'endpoint' | 'p256dh' | 'auth'>;

export function toWebPushSubscription(row: StoredSubscription): PushSubscription {
	return { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } };
}
