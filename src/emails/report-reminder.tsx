import { Text } from 'react-email';
import type { Locale } from './locale.js';
import { ActionButton, BodyText, EmailShell, FallbackLink, IgnoreNote, Strong } from './shared/layout.js';
import { type Segment, Segments, toText } from './shared/segments.js';
import { colors as c } from './shared/theme.js';

// What auth-server renders for the `report.reminder` template. The zod schema in
// `notifications/templates.tsx` validates `data` into these (plus `url` and `locale`, which
// auth-server adds). No pastoral or report content (spec rule 16): only the recipient's name, the
// unsubmitted groups, whether each has a saved draft, the week's encouragement and the link.
export type ReportReminderEmailProps = {
	recipientName: string;
	// Already sorted by membership-management (group name, then id); never re-sorted here.
	groups: { name: string; hasDraft: boolean }[];
	// ISO date (YYYY-MM-DD) of the church Sunday; picks the week's Scripture entry.
	weekStart: string;
	url: string;
	locale: Locale;
};

type Variant = 'single' | 'singleDraft' | 'multi';

type Verse = { text: string; reference: string };

type ReminderCopy = {
	eyebrow: string;
	// Also the email's heading.
	subject: Record<Variant, string>;
	body: {
		single: (name: string, group: string) => Segment[];
		singleDraft: (name: string, group: string) => Segment[];
		multi: (name: string) => Segment[];
	};
	draftSuffix: string;
	verses: Verse[]; // Seven entries, in rotation order.
	button: Record<Variant, string>;
	why: string;
};

// Spec rule 19, word for word (apostrophes typographic, like the other emails).
const copy: Record<Locale, ReminderCopy> = {
	en: {
		eyebrow: 'Weekly reminder',
		subject: {
			single: 'Time to submit your small group report',
			singleDraft: 'Don’t forget to submit your small group report draft',
			multi: 'Time to submit your small group reports',
		},
		body: {
			single: (name, group) => [
				'Hi ',
				{ strong: name },
				', thank you for shepherding ',
				{ strong: group },
				' this week. When you have a moment, please submit this week’s report so the elders can pray with you and care for your group.',
			],
			singleDraft: (name, group) => [
				'Hi ',
				{ strong: name },
				', thank you for shepherding ',
				{ strong: group },
				' this week. You have a saved ',
				{ strong: 'draft' },
				' that hasn’t been submitted yet—when you have a moment, review and submit it so the elders can pray with you and care for your group.',
			],
			multi: (name) => [
				'Hi ',
				{ strong: name },
				', thank you for shepherding your small groups this week. When you have a moment, please submit this week’s report for each group below so the elders can pray with you and care for your groups:',
			],
		},
		draftSuffix: ' — draft saved, not submitted yet',
		verses: [
			{ text: 'Stay diligent and serve the Lord with a fervent spirit.', reference: 'Romans 12:11' },
			{
				text: 'Do not grow weary of doing good; in due time your faithful work will bear fruit.',
				reference: 'Galatians 6:9',
			},
			{
				text: 'Whatever you do, put your whole heart into it as working for the Lord, not for people.',
				reference: 'Colossians 3:23–24',
			},
			{
				text: 'Stand firm and keep giving yourself fully to the Lord’s work, knowing your labor is never in vain.',
				reference: '1 Corinthians 15:58',
			},
			{
				text: 'Whatever task is in your hands today, give it your very best strength.',
				reference: 'Ecclesiastes 9:10',
			},
			{
				text: 'Careful, diligent attention leads to steady fruit, while rushing leaves things unfinished.',
				reference: 'Proverbs 21:5',
			},
			{
				text: 'Make every effort to grow your faith with goodness, patience, and brotherly love as you care for others.',
				reference: '2 Peter 1:5–7',
			},
		],
		button: { single: 'Submit report', singleDraft: 'Review & submit draft', multi: 'Open reports' },
		why: 'You’re getting this because you lead or co-lead an open small group. You can turn off weekly report reminders in My profile.',
	},
	es: {
		eyebrow: 'Recordatorio semanal',
		subject: {
			single: 'Es momento de enviar el reporte de tu grupo pequeño',
			singleDraft: 'No olvides enviar el borrador del reporte de tu grupo pequeño',
			multi: 'Es momento de enviar los reportes de tus grupos pequeños',
		},
		body: {
			single: (name, group) => [
				'Hola ',
				{ strong: name },
				', gracias por cuidar y servir a ',
				{ strong: group },
				' esta semana. Cuando tengas un momento, envía el reporte semanal para que los ancianos puedan orar contigo y acompañar a tu grupo.',
			],
			singleDraft: (name, group) => [
				'Hola ',
				{ strong: name },
				', gracias por cuidar y servir a ',
				{ strong: group },
				' esta semana. Tienes un ',
				{ strong: 'borrador' },
				' guardado que aún no ha sido enviado; cuando tengas un momento, revísalo y envíalo para que los ancianos puedan orar contigo y acompañar a tu grupo.',
			],
			multi: (name) => [
				'Hola ',
				{ strong: name },
				', gracias por cuidar y servir a tus grupos pequeños esta semana. Cuando tengas un momento, envía el reporte semanal de cada grupo para que los ancianos puedan orar contigo y acompañarlos:',
			],
		},
		draftSuffix: ' — borrador guardado, aún sin enviar',
		verses: [
			{ text: 'No pierdas la diligencia; sirve al Señor con un espíritu ferviente.', reference: 'Romanos 12:11' },
			{
				text: 'No te canses de hacer el bien; a su debido tiempo verás el fruto si no te rindes.',
				reference: 'Gálatas 6:9',
			},
			{
				text: 'Todo lo que hagas, hazlo de corazón, como para el Señor y no para los hombres.',
				reference: 'Colosenses 3:23–24',
			},
			{
				text: 'Mantente firme y constante en la obra del Señor, sabiendo que tu trabajo nunca es en vano.',
				reference: '1 Corintios 15:58',
			},
			{
				text: 'Todo lo que esté al alcance de tu mano hacer hoy, hazlo con todas tus fuerzas.',
				reference: 'Eclesiastés 9:10',
			},
			{
				text: 'La diligencia y el cuidado constante dan fruto, mientras que las prisas dejan lo importante atrás.',
				reference: 'Proverbios 21:5',
			},
			{
				text: 'Pon toda diligencia en acompañar tu fe con paciencia, dominio propio y amor al cuidar de los demás.',
				reference: '2 Pedro 1:5–7',
			},
		],
		button: { single: 'Enviar reporte', singleDraft: 'Revisar y enviar borrador', multi: 'Abrir reportes' },
		why: 'Recibes este correo porque lideras o co-lideras un grupo pequeño activo. Puedes desactivar los recordatorios semanales de reportes en Mi perfil.',
	},
};

const VERSE_COUNT = copy.en.verses.length;
const MS_PER_DAY = 86_400_000;

// Whole days since 1970-01-01 for `weekStart` (UTC, so the server time zone can't move it), divided
// by 7 (floored), modulo the number of entries. A church Sunday is always 7 days after the last, so
// every week advances one entry. Exported for tests.
export function reminderVerseIndex(weekStart: string): number {
	const days = Math.floor(Date.parse(`${weekStart}T00:00:00Z`) / MS_PER_DAY);
	const weeks = Math.floor(days / 7);
	return ((weeks % VERSE_COUNT) + VERSE_COUNT) % VERSE_COUNT;
}

export function reminderVariant(groups: ReportReminderEmailProps['groups']): Variant {
	if (groups.length > 1) return 'multi';
	return groups[0]?.hasDraft ? 'singleDraft' : 'single';
}

export function reportReminderSubject(props: Pick<ReportReminderEmailProps, 'groups' | 'locale'>): string {
	return copy[props.locale].subject[reminderVariant(props.groups)];
}

function bodySegments(props: ReportReminderEmailProps): Segment[] {
	const t = copy[props.locale].body;
	const variant = reminderVariant(props.groups);
	const group = props.groups[0]?.name ?? '';
	if (variant === 'multi') return t.multi(props.recipientName);
	return variant === 'singleDraft' ? t.singleDraft(props.recipientName, group) : t.single(props.recipientName, group);
}

export function ReportReminderEmail(props: ReportReminderEmailProps) {
	const { groups, weekStart, url, locale } = props;
	const t = copy[locale];
	const variant = reminderVariant(groups);
	const body = bodySegments(props);
	const verse = t.verses[reminderVerseIndex(weekStart)];
	return (
		<EmailShell locale={locale} preview={toText(body)} eyebrow={t.eyebrow} heading={reportReminderSubject(props)}>
			<BodyText spaceAfter={variant === 'multi' ? 12 : 24}>
				<Segments segments={body} strong={(text) => <Strong>{text}</Strong>} />
			</BodyText>
			{variant === 'multi' && (
				<ul style={{ margin: '0 0 24px', paddingLeft: 22, fontSize: 16, lineHeight: '26px', color: c.ink }}>
					{groups.map((group, i) => (
						// biome-ignore lint/suspicious/noArrayIndexKey: the list is static for one render, and names can repeat
						<li key={i}>
							<Strong>{group.name}</Strong>
							{group.hasDraft ? t.draftSuffix : ''}
						</li>
					))}
				</ul>
			)}
			{verse && (
				<Text
					style={{
						margin: '0 0 28px',
						padding: '4px 0 4px 16px',
						borderLeft: `3px solid ${c.gold500}`,
						fontSize: 15,
						lineHeight: '24px',
						color: c.ink,
					}}
				>
					<em>{verse.text}</em> — {verse.reference}
				</Text>
			)}
			<ActionButton href={url}>{t.button[variant]}</ActionButton>
			<FallbackLink locale={locale} href={url} />
			<IgnoreNote>{t.why}</IgnoreNote>
		</EmailShell>
	);
}

export const reportReminderPreviewProps = {
	recipientName: 'Roberto Aguilar',
	groups: [
		{ name: 'Jóvenes Bello Horizonte', hasDraft: true },
		{ name: 'Matrimonios Villa Fontana', hasDraft: false },
	],
	weekStart: '2026-11-22',
	url: 'https://staff.ekklesiaio.com/groups/reports',
} as const satisfies Omit<ReportReminderEmailProps, 'locale' | 'groups'> & {
	groups: readonly { name: string; hasDraft: boolean }[];
};

// Preview for `pnpm email:dev`. The Spanish one is report-reminder.es.tsx.
export default function ReportReminderPreview() {
	return (
		<ReportReminderEmail locale="en" {...reportReminderPreviewProps} groups={[...reportReminderPreviewProps.groups]} />
	);
}
