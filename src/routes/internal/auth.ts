import { createHash, timingSafeEqual } from 'node:crypto';
import type { Context } from 'hono';
import { createMiddleware } from 'hono/factory';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { config } from '../../lib/config.js';

// Every error from /internal/* has this body, so membership-management can log a `code` and tell a
// version mismatch ("unknown_template") from an outage. A bare 404 means "no such route".
export function internalError(c: Context, status: ContentfulStatusCode, code: string, message: string) {
	return c.json({ code, message }, status);
}

// Hashing both sides first gives two 32-byte buffers, so timingSafeEqual never sees different lengths
// and the comparison takes the same time whatever the caller sent (it doesn't even leak the length).
function digest(value: string): Buffer {
	return createHash('sha256').update(value).digest();
}

// Only membership-management calls /internal/*, with the shared INTERNAL_API_TOKEN in X-Internal-Token
// (the reverse of member-link-notifier.ts). Unset token = the feature is off in this environment: 503,
// which the caller treats as transient. The header is never logged.
export const requireInternalToken = createMiddleware(async (c, next) => {
	const expected = config.internalApiToken;
	if (expected === undefined) {
		return internalError(c, 503, 'internal_api_disabled', 'The internal API is not configured.');
	}
	const given = c.req.header('x-internal-token');
	if (given === undefined || !timingSafeEqual(digest(given), digest(expected))) {
		return internalError(c, 401, 'invalid_token', 'Missing or wrong X-Internal-Token.');
	}
	await next();
});
