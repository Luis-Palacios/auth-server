export const locales = ['en', 'es'] as const;
export type Locale = (typeof locales)[number];

// Missing or unsupported values fall back to this in the email sender.
export const defaultLocale: Locale = 'en';

// The language the user picked in staff-app's account menu. Must match LOCALE_COOKIE in
// staff-app/lib/locale-shared.ts. staff-app only writes it when the user picks, so it's
// usually absent for signed-out flows (forgot password, sign-up) - hence the
// Accept-Language fallback below.
const LOCALE_COOKIE = 'ekk_locale';

function isLocale(value: unknown): value is Locale {
	return typeof value === 'string' && (locales as readonly string[]).includes(value);
}

function localeFromCookie(header: string | null | undefined): Locale | undefined {
	// Anchored to the start of the header or a `;` so another cookie whose name merely ends in
	// "ekk_locale" can't match.
	const value = header?.match(new RegExp(`(?:^|;\\s*)${LOCALE_COOKIE}=([^;]+)`))?.[1];
	return isLocale(value) ? value : undefined;
}

// First language in an Accept-Language header that we support, by primary subtag ("es-NI" -> "es").
// Walks the list in the browser's order rather than sorting by q-value (browsers already send it
// most-preferred first) and skips q=0 entries ("not this one"). Same rules as
// localeFromAcceptLanguage in staff-app/lib/locale.ts, so the email matches the page the user saw.
function localeFromAcceptLanguage(header: string | null | undefined): Locale | undefined {
	if (!header) return undefined;

	for (const entry of header.split(',')) {
		const [tag = '', ...params] = entry.trim().split(';');
		const q = params.find((param) => param.trim().startsWith('q='));

		if (q && Number(q.trim().slice(2)) === 0) continue;

		const primary = tag.trim().split('-')[0]?.toLowerCase();

		if (isLocale(primary)) return primary;
	}

	return undefined;
}

// Resolve the email language from the incoming request, in the same order staff-app uses for its
// pages: the user's explicit pick (cookie), then the browser's language (Accept-Language - staff-app's
// /api/auth/* proxy forwards both headers unchanged). Returns undefined when neither yields a supported
// locale, or when the callback has no request, so the sender applies defaultLocale.
export function getLocale(request: Request | undefined): Locale | undefined {
	const headers = request?.headers;
	return localeFromCookie(headers?.get('cookie')) ?? localeFromAcceptLanguage(headers?.get('accept-language'));
}
