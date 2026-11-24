import { createECDH } from 'node:crypto';

// P-256 keys as Web Push uses them: base64url without padding. VAPID (RFC 8292) is our server's pair;
// a browser subscription's `p256dh` (RFC 8291) is the browser's public key, the same kind of value.
// Kept apart from config.ts (which reads the environment on import) so the checks can be unit-tested.

// Exactly `bytes` bytes once decoded, and the same text once encoded back. Buffer silently skips
// characters outside the alphabet, so the round trip is what rejects padding, standard base64's '+' and
// '/', spaces or a truncated paste.
export function decodeBase64Url(value: string, bytes: number): Buffer | null {
	const decoded = Buffer.from(value, 'base64url');
	return decoded.length === bytes && decoded.toString('base64url') === value ? decoded : null;
}

// A P-256 public key: the uncompressed point (0x04, then X and Y, 32 bytes each) and actually on the
// curve (Node rejects a point that isn't, which is what would fail later when encrypting or verifying).
export function isP256PublicKey(value: string): boolean {
	const bytes = decodeBase64Url(value, 65);
	if (bytes?.[0] !== 0x04) return false;
	try {
		// computeSecret needs a key of our own; a throw-away one is enough to make Node check the point.
		const ecdh = createECDH('prime256v1');
		ecdh.generateKeys();
		ecdh.computeSecret(bytes);
		return true;
	} catch {
		return false;
	}
}

export const isVapidPublicKey = isP256PublicKey;

// The private key is the 32-byte scalar.
export function isVapidPrivateKey(value: string): boolean {
	return decodeBase64Url(value, 32) !== null;
}

// The two halves belong together: the public key derived from the private one is the configured public
// key. A mismatched pair signs with one key and announces another (`k=`), so every push service would
// refuse every push. Also rejects a scalar outside the curve's range (setPrivateKey throws).
export function isVapidPair(publicKey: string, privateKey: string): boolean {
	try {
		const ecdh = createECDH('prime256v1');
		ecdh.setPrivateKey(Buffer.from(privateKey, 'base64url'));
		return ecdh.getPublicKey('base64url', 'uncompressed') === publicKey;
	} catch {
		return false;
	}
}
