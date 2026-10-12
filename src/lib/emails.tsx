import type { ReactElement } from 'react';
import { render } from 'react-email';
import { Resend } from 'resend';
import { InviteUserEmail, inviteUserSubject } from '../emails/invite-user.js';
import { defaultLocale, type Locale } from '../emails/locale.js';
import { ResetPasswordEmail, resetPasswordSubject } from '../emails/reset-password.js';
import { VerifyEmail, verifyEmailSubject } from '../emails/verify-email.js';
import { config } from './config.js';

const resend = new Resend(config.resendApiKey);
const from = `Ekklesiaio <${config.resendFromEmail}>`;

// Renders the template to HTML plus a plain-text alternative and sends it. Never rejects: auth
// flows call these without awaiting (a mail problem must not fail sign-up or password reset), so
// failures are logged here instead. The recipient is left out of the log on purpose.
async function send(args: { to: string; subject: string; react: ReactElement }): Promise<void> {
	const { to, subject, react } = args;
	try {
		const [html, text] = await Promise.all([render(react), render(react, { plainText: true })]);
		const { error } = await resend.emails.send({ from, to, subject, html, text });
		if (error) {
			console.error(`Failed to send "${subject}" email`, error);
		}
	} catch (error) {
		console.error(`Failed to send "${subject}" email`, error);
	}
}

export function sendVerifyEmail(args: { to: string; verificationUrl: string; locale?: Locale | undefined }) {
	const locale = args.locale ?? defaultLocale;
	return send({
		to: args.to,
		subject: verifyEmailSubject(locale),
		react: <VerifyEmail locale={locale} verificationUrl={args.verificationUrl} />,
	});
}

export function sendResetPasswordEmail(args: { to: string; url: string; locale?: Locale | undefined }) {
	const locale = args.locale ?? defaultLocale;
	return send({
		to: args.to,
		subject: resetPasswordSubject(locale),
		react: <ResetPasswordEmail locale={locale} url={args.url} email={args.to} />,
	});
}

export function sendInviteUserEmail(args: {
	to: string;
	inviterName?: string | undefined;
	inviterEmail?: string | undefined;
	role: string;
	url: string;
	churchName?: string | undefined;
	ministryName?: string | undefined;
	locale?: Locale | undefined;
}) {
	const locale = args.locale ?? defaultLocale;
	return send({
		to: args.to,
		subject: inviteUserSubject(locale, args.churchName),
		react: (
			<InviteUserEmail
				locale={locale}
				inviterName={args.inviterName}
				inviterEmail={args.inviterEmail}
				roleName={args.role}
				url={args.url}
				email={args.to}
				churchName={args.churchName}
				ministryName={args.ministryName}
			/>
		),
	});
}
