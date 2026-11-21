import { createHash } from 'node:crypto';

// JSON with object keys sorted at every level, so the same request always gives the same string,
// whatever order the caller (or a later version of our schemas) puts the keys in.
function canonicalJson(value: unknown): string {
	if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
	if (value !== null && typeof value === 'object') {
		const record = value as Record<string, unknown>;
		const entries = Object.keys(record)
			.sort()
			.map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`);
		return `{${entries.join(',')}}`;
	}
	return JSON.stringify(value);
}

// Fingerprint of what membership-management asked for under one idempotency key. Same key + a
// different hash = the caller reused a key for a different email: a bug, answered with 409
// idempotency_conflict. The key itself isn't part of it (it's the row's primary key).
export function notificationRequestHash(request: {
	recipientUserId: string;
	template: string;
	data: unknown;
	path: string;
}): string {
	const { recipientUserId, template, data, path } = request;
	return createHash('sha256').update(canonicalJson({ recipientUserId, template, data, path })).digest('hex');
}
