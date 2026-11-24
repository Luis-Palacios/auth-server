import { createHash } from 'node:crypto';
import webpush, { type PushSubscription, type RequestOptions, type SendResult, WebPushError } from 'web-push';
import type { VapidDetails } from './push-vapid.js';

// One push to one device: an HTTPS POST of the encrypted message to the subscription's endpoint, signed
// with our VAPID key. This only sends and reports what the push service answered; what each answer
// means (keep, delete the subscription, retry) is the fan-out's job.

// How long the push service keeps the message while the device is offline (RFC 8030 `TTL`). 24 h, the
// same as the delivery's own expiry in membership-management: past that, it's stale.
export const PUSH_TTL_SECONDS = 24 * 60 * 60;

// web-push's `timeout` is a socket *idle* timeout, not a deadline for the whole request. The fan-out
// puts the overall deadline on top; this only stops one device from hanging on a silent socket.
export const PUSH_SOCKET_TIMEOUT_MS = 3_000;

// RFC 8030 `Topic`: at most 32 characters of the URL-safe base64 alphabet. While an earlier message
// with the same topic waits undelivered at the push service, the new one replaces it, so a retried
// delivery never queues twice. Hashing the idempotency key keeps it short, opaque and stable.
export function pushTopic(idempotencyKey: string): string {
	return createHash('sha256').update(idempotencyKey).digest('base64url').slice(0, 32);
}

export type DeviceAnswer =
	// The push service answered: 201 (accepted), or an error status from WebPushError.
	| { kind: 'answered'; status: number }
	// No answer: timeout, DNS, connection reset, TLS. Never the payload or keys in `reason`.
	| { kind: 'unreachable'; reason: string }
	// web-push refused before sending: this stored subscription's keys can't be encrypted for (the
	// subscribe route checks them, so only an old or hand-made row). It will never work.
	| { kind: 'unusable'; reason: string };

type Send = (subscription: PushSubscription, payload: string, options: RequestOptions) => Promise<SendResult>;
type Prepare = (subscription: PushSubscription, payload: string, options: RequestOptions) => unknown;

function errorCode(error: unknown): string {
	const code = error instanceof Error && 'code' in error ? String(error.code) : undefined;
	return code ?? (error instanceof Error ? error.name : 'unknown');
}

// `vapid` comes from the caller (push-vapid.ts, read from config), so this file doesn't load the config
// and stays testable; `send` is web-push's unless a test passes its own.
export async function sendToDevice(
	subscription: PushSubscription,
	payload: string,
	idempotencyKey: string,
	{
		vapid,
		send = webpush.sendNotification,
		prepare = webpush.generateRequestDetails,
	}: { vapid: VapidDetails; send?: Send; prepare?: Prepare },
): Promise<DeviceAnswer> {
	const options: RequestOptions = {
		vapidDetails: vapid,
		TTL: PUSH_TTL_SECONDS,
		// A report comment can wait for the phone's next wake-up; `high` would wake it now and cost battery.
		urgency: 'normal',
		topic: pushTopic(idempotencyKey),
		timeout: PUSH_SOCKET_TIMEOUT_MS,
	};
	// Encrypt and sign first, without the network (web-push does the same inside sendNotification): a
	// throw here is about this subscription's keys, not the push service, so it must not be retried.
	try {
		prepare(subscription, payload, options);
	} catch (error) {
		return { kind: 'unusable', reason: errorCode(error) };
	}
	try {
		const result = await send(subscription, payload, options);
		return { kind: 'answered', status: result.statusCode };
	} catch (error) {
		// web-push rejects on any non-2xx answer; turn it back into a status.
		if (error instanceof WebPushError) return { kind: 'answered', status: error.statusCode };
		return { kind: 'unreachable', reason: errorCode(error) };
	}
}
