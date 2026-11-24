import type { DeviceAnswer } from './push-send.js';

// What one device's answer means (notifications spec, *The fan-out and its outcome*). Pure, so the
// table is tested on its own.
//
// - sent: 2xx. The push service accepted it (201 Created); it will deliver when the device is online.
// - gone: 404 / 410. The subscription no longer exists at the push service (the user revoked
//   permission, cleared site data, the browser rotated it). Delete it: it will never work again.
//   Also a row whose keys web-push can't encrypt for.
// - bug: 400 / 413, and the 401 / 403 a push service sends when our VAPID signature doesn't match the
//   key the subscription was made with. Our request is wrong; retrying the same bytes can't help. Log
//   it as an error and skip that device.
// - transient: 429, 5xx, no answer at all, or past the fan-out deadline. Worth retrying later; the
//   devices already sent are skipped then (push_sends).
export type DeviceVerdict = 'sent' | 'gone' | 'bug' | 'transient';

export function judgeDevice(answer: DeviceAnswer | 'deadline'): DeviceVerdict {
	if (answer === 'deadline' || answer.kind === 'unreachable') return 'transient';
	// Keys web-push can't encrypt for: the row can never work, so it goes like a 410.
	if (answer.kind === 'unusable') return 'gone';
	const { status } = answer;
	if (status >= 200 && status < 300) return 'sent';
	if (status === 404 || status === 410) return 'gone';
	if (status === 429 || status >= 500) return 'transient';
	return 'bug';
}

// The whole request's answer, in the spec's order: any transient → retry (503); else something sent,
// now or on an earlier attempt → 200; else no device left → 404 no_push_subscription.
export type PushVerdict = { outcome: 'transient' } | { outcome: 'sent'; sent: number } | { outcome: 'none' };

export function judgeRequest(counts: { sent: number; alreadySent: number; transient: number }): PushVerdict {
	if (counts.transient > 0) return { outcome: 'transient' };
	const sent = counts.sent + counts.alreadySent;
	return sent > 0 ? { outcome: 'sent', sent } : { outcome: 'none' };
}
