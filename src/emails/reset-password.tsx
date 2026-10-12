import type { Locale } from './locale.js';
import { ActionButton, BodyText, EmailShell, FallbackLink, IgnoreNote, Strong } from './shared/layout.js';

const copy = {
	en: {
		subject: 'Reset your password',
		preview: 'Choose a new password for your ekklesiaio account.',
		eyebrow: 'Password reset',
		heading: 'Reset your password',
		body: (email: string) => (
			<>
				We received a request to reset the password for the ekklesiaio account associated with <Strong>{email}</Strong>.
				If you made this request, press the button below to choose a new password.
			</>
		),
		button: 'Reset password',
		ignore:
			"If you didn't ask for this, you can ignore this email and your password will stay the same. ekklesiaio will never email you to ask for your password, credit card or bank account number.",
	},
	es: {
		subject: 'Restablece tu contraseña',
		preview: 'Elige una nueva contraseña para tu cuenta de ekklesiaio.',
		eyebrow: 'Restablecer contraseña',
		heading: 'Restablece tu contraseña',
		body: (email: string) => (
			<>
				Recibimos una solicitud para restablecer la contraseña de la cuenta de ekklesiaio asociada a{' '}
				<Strong>{email}</Strong>. Si la hiciste tú, pulsa el botón de abajo para elegir una nueva contraseña.
			</>
		),
		button: 'Restablecer contraseña',
		ignore:
			'Si no lo solicitaste, puedes ignorar este correo y tu contraseña seguirá igual. ekklesiaio nunca te escribirá para pedirte tu contraseña, tarjeta de crédito o número de cuenta bancaria.',
	},
} satisfies Record<Locale, unknown>;

export const resetPasswordSubject = (locale: Locale) => copy[locale].subject;

export function ResetPasswordEmail({ locale, url, email }: { locale: Locale; url: string; email: string }) {
	const t = copy[locale];
	return (
		<EmailShell locale={locale} preview={t.preview} eyebrow={t.eyebrow} heading={t.heading}>
			<BodyText>{t.body(email)}</BodyText>
			<ActionButton href={url}>{t.button}</ActionButton>
			<FallbackLink locale={locale} href={url} />
			<IgnoreNote>{t.ignore}</IgnoreNote>
		</EmailShell>
	);
}

// Preview for `pnpm email:dev`. The Spanish one is reset-password.es.tsx.
export default function ResetPasswordPreview() {
	return (
		<ResetPasswordEmail locale="en" url="https://example.com/reset-password?token=abc123" email="ana@iglesia.org" />
	);
}
