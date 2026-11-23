import type { VapidKeys } from 'web-push';
import { config } from '../lib/config.js';

// What identifies this server to the push services (VAPID, RFC 8292). The send passes it on every
// call (`sendNotification(…, { vapidDetails })`) instead of web-push's global `setVapidDetails()`, so
// nothing depends on import order and a test can pass its own keys.
//
// - The public key was given to each browser at subscribe time (staff-app reads it from
//   GET /api/push/config); the push service bound the subscription to it.
// - The private key signs a short JWT per request (aud = the push service's origin, exp ≤ 24 h,
//   sub = `subject`). The push service checks it against the bound public key: only the holder of
//   this private key can push to our subscriptions. Rotating the pair orphans every subscription.
// - `subject` is a mailto: contact the push service can use if this server misbehaves.
//
// Only read while PUSH_NOTIFICATIONS_ENABLED is on; config refuses to start without valid keys then.
export type VapidDetails = VapidKeys & { subject: string };

export const vapidDetails: VapidDetails = {
	subject: config.vapidSubject,
	publicKey: config.vapidPublicKey,
	privateKey: config.vapidPrivateKey,
};
