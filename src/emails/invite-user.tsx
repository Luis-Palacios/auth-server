import type { ReactNode } from 'react';
import { Link } from 'react-email';
import type { roles } from '../permissions/statements.js';
import type { Locale } from './locale.js';
import { ActionButton, BodyText, EmailShell, FallbackLink, IgnoreNote, Strong } from './shared/layout.js';
import { colors as c } from './shared/theme.js';

// Same labels as the staff app's "Roles" messages. Typed against `roles` so adding a role there
// fails the typecheck here until it has a label.
const roleLabels: Record<keyof typeof roles, Record<Locale, string>> = {
	admin: { en: 'Admin', es: 'Administrador' },
	user: { en: 'User', es: 'Usuario' },
	smallGroupLeader: { en: 'Small Group Leader', es: 'Líder de grupo pequeño' },
	deacon: { en: 'Deacon', es: 'Diácono' },
	pending: { en: 'Pending', es: 'Pendiente' },
	elder: { en: 'Elder', es: 'Anciano' },
};

function roleLabel(role: string, locale: Locale): string {
	return (roleLabels as Record<string, Record<Locale, string> | undefined>)[role]?.[locale] ?? role;
}

type InviteCopy = {
	subject: (church: string | undefined) => string;
	preview: (inviter: string, church: string | undefined) => string;
	// Used when the inviter's name couldn't be resolved.
	anonymousInviter: string;
	eyebrow: string;
	heading: (church: string | undefined) => string;
	invited: (invitee: ReactNode, church: string | undefined, ministry: string | undefined) => ReactNode;
	role: string;
	button: string;
	ignore: string;
};

const copy: Record<Locale, InviteCopy> = {
	en: {
		subject: (church) =>
			church ? `You've been invited to join ${church} on ekklesiaio` : "You've been invited to ekklesiaio",
		preview: (inviter, church) =>
			church ? `${inviter} invited you to join ${church} on ekklesiaio.` : `${inviter} invited you to join ekklesiaio.`,
		anonymousInviter: 'A team member',
		eyebrow: "You're invited",
		heading: (church) => (church ? `Join ${church} on ekklesiaio` : 'Join your team on ekklesiaio'),
		invited: (invitee, church, ministry) => (
			<>
				has invited {invitee} to{' '}
				{church ? (
					<>
						join <Strong>{church}</Strong>
						{ministry ? ` (${ministry})` : ''} on ekklesiaio
					</>
				) : (
					'ekklesiaio'
				)}
				, the platform your church team uses to manage its members.
			</>
		),
		role: 'Your role:',
		button: 'Accept invitation',
		ignore:
			"If you weren't expecting this invitation, you can ignore this email. If you're worried about your account's safety, reply to this email to get in touch with us.",
	},
	es: {
		subject: (church) => (church ? `Te invitaron a unirte a ${church} en ekklesiaio` : 'Te invitaron a ekklesiaio'),
		preview: (inviter, church) =>
			church
				? `${inviter} te invitó a unirte a ${church} en ekklesiaio.`
				: `${inviter} te invitó a unirte a ekklesiaio.`,
		anonymousInviter: 'Un miembro del equipo',
		eyebrow: 'Estás invitado',
		heading: (church) => (church ? `Únete a ${church} en ekklesiaio` : 'Únete a tu equipo en ekklesiaio'),
		invited: (invitee, church, ministry) => (
			<>
				invitó a {invitee} a{' '}
				{church ? (
					<>
						unirse a <Strong>{church}</Strong>
						{ministry ? ` (${ministry})` : ''} en ekklesiaio
					</>
				) : (
					'ekklesiaio'
				)}
				, la plataforma que el equipo de tu iglesia usa para gestionar a sus miembros.
			</>
		),
		role: 'Tu rol:',
		button: 'Aceptar invitación',
		ignore:
			'Si no esperabas esta invitación, puedes ignorar este correo. Si te preocupa la seguridad de tu cuenta, responde a este correo para ponerte en contacto con nosotros.',
	},
};

export const inviteUserSubject = (locale: Locale, churchName?: string) => copy[locale].subject(churchName);

export type InviteUserEmailProps = {
	locale: Locale;
	inviterName?: string | undefined;
	inviterEmail?: string | undefined;
	roleName: string;
	url: string;
	email: string;
	// The invite names the church (main name) and its ministry when known; both are optional so
	// the email still reads fine without them.
	churchName?: string | undefined;
	ministryName?: string | undefined;
};

export function InviteUserEmail({
	locale,
	inviterName,
	inviterEmail,
	roleName,
	url,
	email,
	churchName,
	ministryName,
}: InviteUserEmailProps) {
	const t = copy[locale];
	const inviter = inviterName || t.anonymousInviter;
	return (
		<EmailShell
			locale={locale}
			preview={t.preview(inviter, churchName)}
			eyebrow={t.eyebrow}
			heading={t.heading(churchName)}
		>
			<BodyText spaceAfter={16}>
				<Strong>{inviter}</Strong>
				{inviterEmail ? (
					<>
						{' '}
						(
						<Link href={`mailto:${inviterEmail}`} style={{ color: c.navy900 }}>
							{inviterEmail}
						</Link>
						)
					</>
				) : null}{' '}
				{t.invited(<Strong>{email}</Strong>, churchName, ministryName)}
			</BodyText>
			<BodyText>
				<span style={{ fontSize: 14, color: c.muted }}>{t.role}</span>{' '}
				<span
					style={{
						display: 'inline-block',
						padding: '2px 10px',
						borderRadius: 999,
						backgroundColor: c.navy100,
						color: c.navy900,
						fontSize: 13,
						fontWeight: 600,
					}}
				>
					{roleLabel(roleName, locale)}
				</span>
			</BodyText>
			<ActionButton href={url}>{t.button}</ActionButton>
			<FallbackLink locale={locale} href={url} />
			<IgnoreNote>{t.ignore}</IgnoreNote>
		</EmailShell>
	);
}

const previewProps = {
	inviterName: 'María López',
	inviterEmail: 'maria@iglesia.org',
	roleName: 'admin',
	url: 'https://example.com/accept-invite?token=abc123',
	email: 'ana@iglesia.org',
	churchName: 'Petra Managua',
	ministryName: 'Ministerio Cristiano Petra',
} as const;

// Preview for `pnpm email:dev`. The Spanish one is invite-user.es.tsx.
export default function InviteUserPreview() {
	return <InviteUserEmail locale="en" {...previewProps} />;
}
