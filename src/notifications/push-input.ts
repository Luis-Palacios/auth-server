import { z } from 'zod';

// Notifications spec rule 10: auth-server only ever calls known push services, so a subscription
// can't be used to make it request an arbitrary URL. Hostnames are compared exactly, or as a suffix
// that starts at a label boundary (".push.apple.com", never "evilpush.apple.com").
const EXACT_HOSTS = new Set(['fcm.googleapis.com', 'web.push.apple.com']);
const HOST_SUFFIXES = ['.push.services.mozilla.com', '.notify.windows.com', '.push.apple.com'];

// A push service URL is a few hundred characters; anything near this is not one.
const MAX_ENDPOINT_LENGTH = 2048;

export function isAllowedPushEndpoint(endpoint: string): boolean {
	if (endpoint.length > MAX_ENDPOINT_LENGTH || !URL.canParse(endpoint)) return false;
	const url = new URL(endpoint);
	// Stored must equal normalized. The WHATWG parser and the legacy url.parse (which a sender may
	// use) disagree on things like "evil.com%2E.push.apple.com", so only a URL that parsing leaves
	// unchanged is accepted: no percent-encoded host, no uppercase host, no explicit :443, no dot
	// segments. It also makes DELETE match exactly what PUT stored.
	if (url.href !== endpoint) return false;
	// `port` is '' for the default 443 (also when written out), so any other port fails here.
	if (url.protocol !== 'https:' || url.username !== '' || url.password !== '' || url.port !== '') return false;
	// URL lowercases the hostname. A trailing dot ("fcm.googleapis.com.") stays and so fails the match.
	const host = url.hostname;
	if (host.split('.').some((label) => label === '')) return false; // empty label: "a..b", trailing dot
	return EXACT_HOSTS.has(host) || HOST_SUFFIXES.some((suffix) => host.endsWith(suffix));
}

// base64url without padding, what browsers send in PushSubscription.toJSON(). Only the shape and a
// sane length are checked here, not that the bytes are a valid key (that fails when sending).
// p256dh is a 65-byte uncompressed P-256 point (87 characters), auth is 16 bytes (22 characters).
const base64Url = /^[A-Za-z0-9_-]+$/;
const p256dh = z.string().regex(base64Url).min(80).max(100);
const auth = z.string().regex(base64Url).min(16).max(48);

// Shape only. Whether the endpoint is an allowed host is a separate answer (422 invalid_endpoint).
export const subscribeBody = z.object({
	endpoint: z.string().min(1).max(MAX_ENDPOINT_LENGTH),
	keys: z.object({ p256dh, auth }),
});

export const unsubscribeBody = z.object({ endpoint: z.string().min(1).max(MAX_ENDPOINT_LENGTH) });

export const MAX_SUBSCRIPTIONS_PER_USER = 10;
export const MAX_USER_AGENT_LENGTH = 200;
