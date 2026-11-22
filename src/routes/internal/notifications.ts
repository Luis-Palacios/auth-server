import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { notificationRequestHash } from '../../notifications/request-hash.js';
import { type SendResult, sendNotification } from '../../notifications/send.js';
import { findNotificationTemplate, notificationEnvelope } from '../../notifications/templates.js';
import { internalError } from './auth.js';

// Real requests are well under 1 KB; anything near this is not from membership-management.
const MAX_BODY_BYTES = 16 * 1024;

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
		const { idempotencyKey, recipientUserId, template, data, path } = envelope.data;

		// 2. The template, then 3. its data and path.
		const entry = findNotificationTemplate(template);
		if (!entry) return internalError(c, 422, 'unknown_template', `Unknown template "${template}".`);
		const validated = entry.validate(data, path);
		if (!validated) {
			return internalError(c, 422, 'invalid_data', `The data or path doesn't fit template "${template}".`);
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
