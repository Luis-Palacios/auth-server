import type { Locale } from '../locale.js';

// "Thursday, October 8" / "jueves 8 de octubre". Parsed as a UTC calendar date and formatted in UTC,
// so the server's time zone can't move it a day. Anything that isn't YYYY-MM-DD is shown as given
// (the templates' zod schemas reject it first; this just keeps a bad value from throwing mid-render).
export function formatMeetingDate(isoDate: string, locale: Locale): string {
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
	if (!match) return isoDate;
	const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
	if (Number.isNaN(date.getTime())) return isoDate;
	const formatted = new Intl.DateTimeFormat(locale, {
		weekday: 'long',
		month: 'long',
		day: 'numeric',
		timeZone: 'UTC',
	}).format(date);
	// Intl gives "jueves, 8 de octubre"; the boards' Spanish has no comma after the weekday.
	return locale === 'es' ? formatted.replace(', ', ' ') : formatted;
}
