import { type Context, Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { config } from '../../lib/config.js';
import { type FanoutResult, fanOutPush, type PushDelivery } from '../../notifications/push-fanout.js';
import { PushMessageTooLargeError } from '../../notifications/push-message.js';
import { notificationRequestHash } from '../../notifications/request-hash.js';
import { type SendResult, sendNotification } from '../../notifications/send.js';
import { findNotificationTemplate, notificationEnvelope } from '../../notifications/templates.js';
import { internalError } from './auth.js';

// Real requests are well under 1 KB; anything near this is not from membership-management.
const MAX_BODY_BYTES = 16 * 1024;

// The push branch (notifications spec Part 2): one delivery to every device of the recipient. Logs one
// line per request: key, template, outcome; never endpoints, names or data.
async function sendPush(c: Context, delivery: PushDelivery) {
	const label = `Push ${delivery.idempotencyKey} (${delivery.template})`;
	// Off here but on at membership-management: a deploy-order or config slip. 503 so it retries until the
	// delivery expires (a 404 would read as "route not deployed" there).
	if (!config.pushEnabled) {
		console.warn(`${label}: push is off (PUSH_NOTIFICATIONS_ENABLED)`);
		return internalError(c, 503, 'push_disabled', 'Push notifications are off on this server.');
	}
	let result: FanoutResult;
	try {
		result = await fanOutPush(delivery);
	} catch (error) {
		if (error instanceof PushMessageTooLargeError) {
			console.error(`${label}: message too large (${error.bytes} bytes)`);
			return internalError(c, 422, 'invalid_data', 'The push message is too large.');
		}
		console.error(`${label} failed`, error);
		return internalError(c, 503, 'send_failed', 'Could not send the push; retry later.');
	}
	console.log(`${label}: ${result.outcome}${result.outcome === 'sent' ? ` ${result.sent}` : ''}`);
	switch (result.outcome) {
		case 'sent':
			return c.json({ sent: result.sent }, 200);
		case 'none':
			return internalError(c, 404, 'no_push_subscription', 'The recipient has no device to push to.');
		case 'recipient_unavailable':
			return internalError(c, 404, 'recipient_unavailable', 'The recipient cannot receive notifications.');
		case 'no_copy':
			return internalError(c, 422, 'unknown_template', `Template "${delivery.template}" has no push.`);
		case 'transient':
			return internalError(c, 503, 'send_failed', 'Some devices could not be reached; retry later.');
	}
}

export const notificationsRoute = new Hono().post(
	'/',
	bodyLimit({
		maxSize: MAX_BODY_BYTES,
		onError: (c) => internalError(c, 422, 'invalid_request', 'The request body is too large.'),
	}),
	async (c) => {
		// 1. The envelope: the fields every notification has.
		const envelope = notificationEnvelope.safeParse(await c.req.json().catch(() => undefined));
		if (!envelope.success) {
			return internalError(c, 422, 'invalid_request', 'The body is not a notification request.');
		}
		const { idempotencyKey, recipientUserId, template, data, path, channel = 'email' } = envelope.data;
		const { notificationId, badgeCount } = envelope.data;
		const pushFieldsOk =
			channel === 'push'
				? notificationId !== undefined && badgeCount !== undefined
				: notificationId === undefined && badgeCount === undefined;
		if (!pushFieldsOk) {
			return internalError(c, 422, 'invalid_request', 'notificationId and badgeCount go with channel "push" only.');
		}

		// 2. The template, then 3. its data and path.
		const entry = findNotificationTemplate(template);
		if (!entry) return internalError(c, 422, 'unknown_template', `Unknown template "${template}".`);
		const validated = entry.validate(data, path);
		if (!validated) {
			return internalError(c, 422, 'invalid_data', `The data or path doesn't fit template "${template}".`);
		}

		if (channel === 'push') {
			return sendPush(c, {
				idempotencyKey,
				recipientUserId,
				template,
				data: validated.data,
				path,
				notificationId: notificationId ?? null,
				badgeCount: badgeCount ?? 0,
			});
		}

		const requestHash = notificationRequestHash({ recipientUserId, template, data: validated.data, path });
		let result: SendResult;
		try {
			result = await sendNotification({
				idempotencyKey,
				recipientUserId,
				template,
				path,
				requestHash,
				render: validated.render,
			});
		} catch (error) {
			// A DB error or a rendering bug: retryable; the row (if any) is reused on the retry.
			console.error(`Notification ${idempotencyKey} (${template}) failed`, error);
			return internalError(c, 503, 'send_failed', 'Could not send the notification; retry later.');
		}

		// One line per request: key, template, outcome. Never the address, names or data.
		const detail = result.outcome === 'sent' ? result.emailId : result.outcome === 'send_failed' ? result.reason : '';
		console.log(`Notification ${idempotencyKey} (${template}): ${result.outcome} ${detail}`.trimEnd());

		switch (result.outcome) {
			case 'sent':
				return c.json({ emailId: result.emailId }, 200);
			case 'recipient_unavailable':
				return internalError(c, 404, 'recipient_unavailable', 'The recipient cannot receive email.');
			case 'idempotency_conflict':
				console.error(`Notification ${idempotencyKey}: same key, different request`);
				return internalError(c, 409, 'idempotency_conflict', 'This key was already used for another request.');
			case 'send_failed':
				return internalError(c, 503, 'send_failed', 'Could not send the notification; retry later.');
		}
	},
);
