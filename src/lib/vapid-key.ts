// VAPID keys (RFC 8292) are an ECDSA P-256 pair, written as web-push generate-vapid-keys prints them:
// base64url without padding. Kept apart from config.ts (which reads the environment on import) so the
// checks can be unit-tested.

// Exactly `bytes` bytes once decoded, and the same text once encoded back. Buffer silently skips
// characters outside the alphabet, so the round trip is what rejects padding, standard base64's '+' and
// '/', spaces or a truncated paste.
function decodesTo(value: string, bytes: number): Buffer | null {
	const decoded = Buffer.from(value, 'base64url');
	return decoded.length === bytes && decoded.toString('base64url') === value ? decoded : null;
}

// The public key is the uncompressed curve point: the 0x04 marker, then X and Y (32 bytes each).
export function isVapidPublicKey(value: string): boolean {
	return decodesTo(value, 65)?.[0] === 0x04;
}

// The private key is the 32-byte scalar.
export function isVapidPrivateKey(value: string): boolean {
	return decodesTo(value, 32) !== null;
}
