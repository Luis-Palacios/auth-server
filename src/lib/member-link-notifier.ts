import { config } from './config.js';

// Tells membership-management that an invite was accepted, so it can link the new user to the member
// with that email (see docs/MEMBER-LINKING-HANDOFF.md). Best-effort by design: if this fails the user
// just shows up as a "Suggested match" and staff link them by hand, so it must never fail the accept.

const enabled = config.membershipApiUrl !== undefined && config.internalApiToken !== undefined;

if (!enabled) {
	console.log('MEMBERSHIP_API_URL is not set: member-link notifications are disabled.');
}

// Aborted on shutdown so a pending request can't hold the process open past SHUTDOWN_TIMEOUT_MS.
const shutdownController = new AbortController();

export function abortPendingNotifications(): void {
	shutdownController.abort();
}

export async function notifyInviteAccepted({ userId, email }: { userId: string; email: string }): Promise<void> {
	if (!enabled) {
		console.debug('Member-link notification skipped (not configured).');
		return;
	}

	try {
		const response = await fetch(`${config.membershipApiUrl}/internal/member-links/accepted-invite`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', 'X-Internal-Token': config.internalApiToken as string },
			body: JSON.stringify({ userId, email }),
			signal: AbortSignal.any([AbortSignal.timeout(config.membershipApiTimeoutMs), shutdownController.signal]),
		});
		if (!response.ok) {
			console.warn(`Member-link notification failed for user ${userId}: HTTP ${response.status}`);
		}
	} catch (error) {
		// Log the error name or system code (ECONNREFUSED, ...) only: a fetch error's message can carry
		// the URL, and the log must never hold the token or the email.
		const cause = error instanceof Error ? error.cause : undefined;
		const code = cause instanceof Error && 'code' in cause ? String(cause.code) : undefined;
		const reason = code ?? (error instanceof Error ? error.name : 'unknown error');
		console.warn(`Member-link notification failed for user ${userId}: ${reason}`);
	}
}
