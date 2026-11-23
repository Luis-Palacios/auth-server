import type { Locale } from './locale.js';
import { ActionButton, BodyText, EmailShell, FallbackLink, IgnoreNote, Strong } from './shared/layout.js';
import { formatMeetingDate } from './shared/meeting-date.js';
import { type Segment, Segments, toText } from './shared/segments.js';
import { colors as c } from './shared/theme.js';

// What auth-server renders for the `report.submitted` template. The zod schema in
// `notifications/templates.tsx` validates `data` into these (plus `url` and `locale`, which
// auth-server adds). No free text from the report and no member names, on purpose (spec rule 12):
// only the group, the meeting date, who submitted it, the attendance count and where to open it.
export type ReportSubmittedEmailProps = {
	submitterName: string;
	groupName: string;
	// ISO date (YYYY-MM-DD) of the meeting the report is about; formatted here in the recipient's language.
	meetingDate: string;
	// Why this recipient gets it; picks the footer line. Watchers are the only audience for now.
	reason: 'watcher';
	url: string;
	locale: Locale;
} & (
	| { held: true; attendedCount: number; peopleCount: number }
	// A no meeting has no attendance, so the counts can't be passed at all.
	| { held: false; attendedCount?: never; peopleCount?: never }
);

type SubmittedCopy = {
	eyebrow: string;
	// Also the email's heading.
	subject: { held: (group: string, date: string) => string; notHeld: (group: string, date: string) => string };
	body: {
		held: (submitter: string, attended: number, people: number) => Segment[];
		notHeld: (submitter: string) => Segment[];
	};
	button: string;
	why: Record<ReportSubmittedEmailProps['reason'], Segment[]>;
};

// Spec rule 13, word for word (apostrophes typographic, like the other emails).
const copy: Record<Locale, SubmittedCopy> = {
	en: {
		eyebrow: 'Report submitted',
		subject: {
			held: (group, date) => `${group} submitted its report for ${date}`,
			notHeld: (group, date) => `${group} didn’t meet on ${date}`,
		},
		body: {
			held: (submitter, attended, people) => [
				{ strong: submitter },
				` submitted the report. ${attended} of ${people} attended.`,
			],
			notHeld: (submitter) => [{ strong: submitter }, ' reported that the group didn’t meet.'],
		},
		button: 'Open report',
		why: {
			watcher: [
				'You’re getting this because you watch this group. You can unwatch it, or turn off submitted report emails, in My profile.',
			],
		},
	},
	es: {
		eyebrow: 'Reporte enviado',
		subject: {
			held: (group, date) => `${group} envió su reporte del ${date}`,
			notHeld: (group, date) => `${group} no se reunió el ${date}`,
		},
		body: {
			held: (submitter, attended, people) => [
				{ strong: submitter },
				` envió el reporte. Asistieron ${attended} de ${people}.`,
			],
			notHeld: (submitter) => [{ strong: submitter }, ' reportó que el grupo no se reunió.'],
		},
		button: 'Abrir reporte',
		why: {
			watcher: [
				'Recibes este correo porque sigues este grupo. Puedes dejar de seguirlo, o desactivar los correos de reportes enviados, en Mi perfil.',
			],
		},
	},
};

export function reportSubmittedSubject(props: ReportSubmittedEmailProps): string {
	const t = copy[props.locale];
	const date = formatMeetingDate(props.meetingDate, props.locale);
	return props.held ? t.subject.held(props.groupName, date) : t.subject.notHeld(props.groupName, date);
}

function bodySegments(props: ReportSubmittedEmailProps): Segment[] {
	const t = copy[props.locale];
	return props.held
		? t.body.held(props.submitterName, props.attendedCount, props.peopleCount)
		: t.body.notHeld(props.submitterName);
}

// Bold in the footer is ink, not navy (as in the conversation emails).
const footerStrong = (text: string) => <strong style={{ color: c.ink }}>{text}</strong>;

export function ReportSubmittedEmail(props: ReportSubmittedEmailProps) {
	const { reason, url, locale } = props;
	const t = copy[locale];
	const body = bodySegments(props);
	return (
		<EmailShell locale={locale} preview={toText(body)} eyebrow={t.eyebrow} heading={reportSubmittedSubject(props)}>
			<BodyText spaceAfter={28}>
				<Segments segments={body} strong={(text) => <Strong>{text}</Strong>} />
			</BodyText>
			<ActionButton href={url}>{t.button}</ActionButton>
			<FallbackLink locale={locale} href={url} />
			<IgnoreNote>
				<Segments segments={t.why[reason]} strong={footerStrong} />
			</IgnoreNote>
		</EmailShell>
	);
}

export const reportSubmittedPreviewProps = {
	submitterName: 'Roberto Aguilar',
	groupName: 'Jóvenes Bello Horizonte',
	meetingDate: '2026-10-08',
	held: true,
	attendedCount: 9,
	peopleCount: 12,
	reason: 'watcher',
	url: 'https://staff.ekklesiaio.com/groups/reports/812',
} as const satisfies Omit<ReportSubmittedEmailProps, 'locale'>;

// Preview for `pnpm email:dev`. The Spanish one is report-submitted.es.tsx.
export default function ReportSubmittedPreview() {
	return <ReportSubmittedEmail locale="en" {...reportSubmittedPreviewProps} />;
}
