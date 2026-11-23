import type { Locale } from '../emails/locale.js';
import type { ReportConversationData, ReportReminderData, ReportSubmittedData } from './templates.js';

// Title and body of a push, from a template's already validated `data` (notifications spec, *Copy
// (en / es)*). The same strings as staff-app's notification list: the title is the entry's title and
// the body its secondary line. Only what the emails' data carries (rule 8), never comment text.
// Pure: no I/O, no config.
export type PushCopy = { title: string; body: string };

// Dates must read exactly as in staff-app's list, so these copy its helpers (lib/format-date.ts):
// a date-only value at UTC midnight, formatted in UTC so the calendar day never shifts.
function formatCalendarWith(iso: string, locale: Locale, options: Intl.DateTimeFormatOptions): string {
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
	if (!match) return '';
	const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
	return new Intl.DateTimeFormat(locale, { ...options, timeZone: 'UTC' }).format(date);
}

// {date}: "Thu, Oct 8" / "jue 8 oct" (staff-app's formatCalendarRowDate; Spanish has no comma).
function formatRowDate(iso: string, locale: Locale): string {
	const text = formatCalendarWith(iso, locale, { weekday: 'short', month: 'short', day: 'numeric' });
	return locale === 'es' ? text.replace(',', '') : text;
}

// {weekStart}: "Nov 22" / "22 nov" (staff-app's formatCalendarShortDate).
function formatShortDate(iso: string, locale: Locale): string {
	return formatCalendarWith(iso, locale, { month: 'short', day: 'numeric' });
}

// The emails' section names (src/emails/report-conversation*.tsx), with the article Spanish needs.
const sections: Record<Locale, Record<'prayer' | 'praise' | 'followUp', string>> = {
	en: { prayer: 'prayer requests', praise: 'praise reports', followUp: 'items for the elders to follow up' },
	es: {
		prayer: 'las peticiones de oración',
		praise: 'los motivos de alabanza',
		followUp: 'los puntos para seguimiento de los ancianos',
	},
};

// `report-conversation.new` and `report-conversation.reply` share one data shape; `kind` picks.
export function reportConversationPushCopy(
	kind: 'new' | 'reply',
	data: ReportConversationData,
	locale: Locale,
): PushCopy {
	const date = formatRowDate(data.meetingDate, locale);
	const { actorName: actor, groupName: group } = data;
	const body = locale === 'es' ? `${group} · reporte del ${date}` : `${group} · report for ${date}`;

	if (kind === 'reply') {
		return {
			title: locale === 'es' ? `${actor} respondió en una conversación` : `${actor} replied in a conversation`,
			body,
		};
	}
	if (data.topic === 'person') {
		return {
			title:
				locale === 'es'
					? `${actor} inició una conversación sobre una persona`
					: `${actor} started a conversation about someone`,
			body,
		};
	}
	const section = sections[locale][data.topic];
	return {
		title: locale === 'es' ? `${actor} comentó en ${section}` : `${actor} commented on the ${section}`,
		body,
	};
}

export function reportSubmittedPushCopy(data: ReportSubmittedData, locale: Locale): PushCopy {
	const date = formatRowDate(data.meetingDate, locale);
	const { groupName: group, submitterName: submitter } = data;

	if (!data.held) {
		return locale === 'es'
			? { title: `${group} no se reunió`, body: `${date} · reportado por ${submitter}` }
			: { title: `${group} didn’t meet`, body: `${date} · reported by ${submitter}` };
	}
	const { attendedCount: attended, peopleCount: people } = data;
	return locale === 'es'
		? {
				title: `${group} envió su reporte`,
				body: `${date} · Asistieron ${attended} de ${people} · por ${submitter}`,
			}
		: {
				title: `${group} submitted its report`,
				body: `${date} · ${attended} of ${people} attended · by ${submitter}`,
			};
}

// One group (submit, or finish its draft) or several (a count). The caller sends `groups` non-empty.
export function reportReminderPushCopy(data: ReportReminderData, locale: Locale): PushCopy {
	const weekStart = formatShortDate(data.weekStart, locale);
	const body = locale === 'es' ? `Semana del ${weekStart}` : `Week of ${weekStart}`;
	const [only, ...others] = data.groups;

	if (only && others.length === 0) {
		const group = only.name;
		if (only.hasDraft) {
			return {
				title: locale === 'es' ? `El reporte de ${group} sigue en borrador` : `Your ${group} report is still a draft`,
				body,
			};
		}
		return {
			title: locale === 'es' ? `Es momento de enviar el reporte de ${group}` : `Time to submit the ${group} report`,
			body,
		};
	}
	const count = data.groups.length;
	return {
		title:
			locale === 'es'
				? `Es momento de enviar ${count} reportes de grupos pequeños`
				: `Time to submit ${count} small group reports`,
		body,
	};
}
