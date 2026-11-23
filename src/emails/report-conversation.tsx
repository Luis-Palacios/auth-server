import type { CSSProperties } from 'react';
import { Text } from 'react-email';
import type { Locale } from './locale.js';
import { ActionButton, BodyText, EmailShell, FallbackLink, IgnoreNote, Strong } from './shared/layout.js';
import { formatMeetingDate } from './shared/meeting-date.js';
import { type Segment, Segments, toText } from './shared/segments.js';
import { colors as c } from './shared/theme.js';

// What auth-server renders for the `report-conversation.new` and `report-conversation.reply`
// templates. Stage 3's zod schema validates `data` into these (plus `url` and `locale`, which
// auth-server adds). No comment text and no member name, on purpose: the email only says who wrote,
// which group, which report and where to open it.
export type ReportConversationEmailProps = {
	kind: 'new' | 'reply';
	actorName: string;
	groupName: string;
	// ISO date (YYYY-MM-DD) of the meeting the report is about; formatted here in the recipient's language.
	meetingDate: string;
	// Why this recipient gets it; picks the footer line (and the reply body for non-participants).
	reason: 'leader' | 'participant' | 'watcher';
	// What the thread is about: a person's row (member or guest) or one of the report's sections.
	topic: 'person' | 'prayer' | 'praise' | 'followUp';
	// Which side started the thread; picks the "new" title (it can only say "An elder" for elders).
	startedBy: 'elders' | 'leaders';
	url: string;
	locale: Locale;
};

type Section = Exclude<ReportConversationEmailProps['topic'], 'person'>;

type ConversationCopy = {
	subject: { new: (actor: string, group: string) => string; reply: (actor: string) => string };
	eyebrow: Record<ReportConversationEmailProps['kind'], string>;
	title: { elders: string; leaders: (group: string) => string; reply: string };
	// Spanish carries its article ("las peticiones…", "los motivos…") so the sentence agrees in gender.
	sections: Record<Section, string>;
	body: {
		newPerson: (actor: string, group: string, date: string) => Segment[];
		newSection: (actor: string, section: string, group: string, date: string) => Segment[];
		replyParticipant: (actor: string, group: string, date: string) => Segment[];
		// Leaders and watchers who haven't commented: "a conversation you're part of" would be wrong.
		replyOther: (actor: string, group: string, date: string) => Segment[];
	};
	privacy: string;
	button: string;
	why: Record<ReportConversationEmailProps['reason'], (group: string) => Segment[]>;
	throttle: Segment[];
};

const copy: Record<Locale, ConversationCopy> = {
	en: {
		subject: {
			new: (actor, group) => `${actor} commented on a ${group} report`,
			reply: (actor) => `${actor} replied in a conversation`,
		},
		eyebrow: { new: 'New conversation', reply: 'New reply' },
		title: {
			elders: 'An elder commented on your group’s report',
			leaders: (group) => `A leader commented on a ${group} report`,
			reply: 'There’s a reply in a conversation',
		},
		sections: { prayer: 'prayer requests', praise: 'praise reports', followUp: 'items for the elders to follow up' },
		body: {
			newPerson: (actor, group, date) => [
				{ strong: actor },
				' started a conversation about someone in the ',
				{ strong: group },
				' report for ',
				{ strong: date },
				'.',
			],
			newSection: (actor, section, group, date) => [
				{ strong: actor },
				' started a conversation about the ',
				{ strong: section },
				' in the ',
				{ strong: group },
				' report for ',
				{ strong: date },
				'.',
			],
			replyParticipant: (actor, group, date) => [
				{ strong: actor },
				' replied in a conversation you’re part of, on the ',
				{ strong: group },
				' report for ',
				{ strong: date },
				'.',
			],
			replyOther: (actor, group, date) => [
				{ strong: actor },
				' replied in a conversation on the ',
				{ strong: group },
				' report for ',
				{ strong: date },
				'.',
			],
		},
		privacy:
			'To protect the people in your group, comments are never included in emails. Open the conversation in ekklesiaio to read it and reply.',
		button: 'Open the conversation',
		why: {
			leader: (group) => [`You’re getting this because you lead ${group}.`],
			participant: () => ['You’re getting this because you commented in this conversation.'],
			watcher: (group) => [
				`You’re getting this because you watch ${group}. To stop emails about this group, turn off `,
				{ strong: 'Watching' },
				' on the group’s page or in My profile.',
			],
		},
		throttle: [
			'You won’t get another email about this conversation until you open it. To stop these emails, turn off ',
			{ strong: 'Conversation emails' },
			' in My profile.',
		],
	},
	es: {
		subject: {
			new: (actor, group) => `${actor} comentó en un reporte de ${group}`,
			reply: (actor) => `${actor} respondió en una conversación`,
		},
		eyebrow: { new: 'Nueva conversación', reply: 'Nueva respuesta' },
		title: {
			elders: 'Un anciano comentó en el reporte de tu grupo',
			leaders: (group) => `Un líder comentó en un reporte de ${group}`,
			reply: 'Hay una respuesta en una conversación',
		},
		sections: {
			prayer: 'las peticiones de oración',
			praise: 'los motivos de alabanza',
			followUp: 'los puntos para seguimiento de los ancianos',
		},
		body: {
			newPerson: (actor, group, date) => [
				{ strong: actor },
				' inició una conversación sobre alguien en el reporte de ',
				{ strong: group },
				' del ',
				{ strong: date },
				'.',
			],
			newSection: (actor, section, group, date) => [
				{ strong: actor },
				' inició una conversación sobre ',
				{ strong: section },
				' del reporte de ',
				{ strong: group },
				' del ',
				{ strong: date },
				'.',
			],
			replyParticipant: (actor, group, date) => [
				{ strong: actor },
				' respondió en una conversación en la que participas, en el reporte de ',
				{ strong: group },
				' del ',
				{ strong: date },
				'.',
			],
			replyOther: (actor, group, date) => [
				{ strong: actor },
				' respondió en una conversación del reporte de ',
				{ strong: group },
				' del ',
				{ strong: date },
				'.',
			],
		},
		privacy:
			'Para proteger a las personas de tu grupo, los comentarios nunca se incluyen en los correos. Abre la conversación en ekklesiaio para leerla y responder.',
		button: 'Abrir la conversación',
		why: {
			leader: (group) => [`Recibes esto porque lideras ${group}.`],
			participant: () => ['Recibes esto porque comentaste en esta conversación.'],
			watcher: (group) => [
				`Recibes esto porque sigues ${group}. Para dejar de recibir correos sobre este grupo, desactiva `,
				{ strong: 'Siguiendo' },
				' en la página del grupo o en Mi perfil.',
			],
		},
		throttle: [
			'No recibirás otro correo sobre esta conversación hasta que la abras. Para dejar de recibirlos, desactiva ',
			{ strong: 'Correos de conversaciones' },
			' en Mi perfil.',
		],
	},
};

function bodySegments(props: ReportConversationEmailProps): Segment[] {
	const t = copy[props.locale];
	const date = formatMeetingDate(props.meetingDate, props.locale);
	if (props.kind === 'reply') {
		return props.reason === 'participant'
			? t.body.replyParticipant(props.actorName, props.groupName, date)
			: t.body.replyOther(props.actorName, props.groupName, date);
	}
	return props.topic === 'person'
		? t.body.newPerson(props.actorName, props.groupName, date)
		: t.body.newSection(props.actorName, t.sections[props.topic], props.groupName, date);
}

export function reportConversationSubject(props: ReportConversationEmailProps): string {
	const t = copy[props.locale];
	return props.kind === 'new' ? t.subject.new(props.actorName, props.groupName) : t.subject.reply(props.actorName);
}

const privacyBox: CSSProperties = {
	margin: '0 0 28px',
	padding: '12px 14px',
	borderRadius: 10,
	backgroundColor: '#F1F4F8',
	fontSize: 14,
	lineHeight: '22px',
	color: c.ink,
};

// Bold in the footer is ink, not navy (the boards' footer).
const footerStrong = (text: string) => <strong style={{ color: c.ink }}>{text}</strong>;

export function ReportConversationEmail(props: ReportConversationEmailProps) {
	const { kind, startedBy, reason, groupName, url, locale } = props;
	const t = copy[locale];
	const body = bodySegments(props);
	const heading =
		kind === 'reply' ? t.title.reply : startedBy === 'elders' ? t.title.elders : t.title.leaders(groupName);
	return (
		<EmailShell locale={locale} preview={toText(body)} eyebrow={t.eyebrow[kind]} heading={heading}>
			<BodyText spaceAfter={20}>
				<Segments segments={body} strong={(text) => <Strong>{text}</Strong>} />
			</BodyText>
			<Text style={privacyBox}>{t.privacy}</Text>
			<ActionButton href={url}>{t.button}</ActionButton>
			<FallbackLink locale={locale} href={url} />
			<IgnoreNote>
				<Segments segments={[...t.why[reason](groupName), ' ', ...t.throttle]} strong={footerStrong} />
			</IgnoreNote>
		</EmailShell>
	);
}

export const reportConversationPreviewProps = {
	kind: 'new',
	actorName: 'Roberto Aguilar',
	groupName: 'Jóvenes Bello Horizonte',
	meetingDate: '2026-10-08',
	reason: 'leader',
	topic: 'person',
	startedBy: 'elders',
	url: 'https://staff.ekklesiaio.com/groups/reports/812?person=1207',
} as const satisfies Omit<ReportConversationEmailProps, 'locale'>;

// Preview for `pnpm email:dev`. The Spanish one is report-conversation.es.tsx.
export default function ReportConversationPreview() {
	return <ReportConversationEmail locale="en" {...reportConversationPreviewProps} />;
}
