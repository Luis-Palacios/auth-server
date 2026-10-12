import type { Locale } from './locale.js';
import { ActionButton, BodyText, EmailShell, FallbackLink, IgnoreNote } from './shared/layout.js';

const copy: Record<
	Locale,
	{ subject: string; preview: string; eyebrow: string; heading: string; body: string; button: string; ignore: string }
> = {
	en: {
		subject: 'Verify your email address',
		preview: 'Confirm your email address to finish setting up ekklesiaio.',
		eyebrow: 'Verify your email',
		heading: 'Confirm your email address',
		body: 'Press the button below to confirm this email address and finish setting up your ekklesiaio account.',
		button: 'Verify email',
		ignore:
			"If you didn't create an ekklesiaio account, you can ignore this email. ekklesiaio will never email you to ask for your password, credit card or bank account number.",
	},
	es: {
		subject: 'Verifica tu correo electrónico',
		preview: 'Confirma tu correo para terminar de configurar tu cuenta de ekklesiaio.',
		eyebrow: 'Verifica tu correo',
		heading: 'Confirma tu correo electrónico',
		body: 'Pulsa el botón de abajo para confirmar esta dirección de correo y terminar de configurar tu cuenta de ekklesiaio.',
		button: 'Verificar correo',
		ignore:
			'Si no creaste una cuenta de ekklesiaio, puedes ignorar este correo. ekklesiaio nunca te escribirá para pedirte tu contraseña, tarjeta de crédito o número de cuenta bancaria.',
	},
};

export const verifyEmailSubject = (locale: Locale) => copy[locale].subject;

export function VerifyEmail({ locale, verificationUrl }: { locale: Locale; verificationUrl: string }) {
	const t = copy[locale];
	return (
		<EmailShell locale={locale} preview={t.preview} eyebrow={t.eyebrow} heading={t.heading}>
			<BodyText>{t.body}</BodyText>
			<ActionButton href={verificationUrl}>{t.button}</ActionButton>
			<FallbackLink locale={locale} href={verificationUrl} />
			<IgnoreNote>{t.ignore}</IgnoreNote>
		</EmailShell>
	);
}

// Preview for `pnpm email:dev`. The Spanish one is verify-email.es.tsx.
export default function VerifyEmailPreview() {
	return <VerifyEmail locale="en" verificationUrl="https://example.com/verify-email?token=abc123" />;
}
