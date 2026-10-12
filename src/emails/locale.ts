export const locales = ['en', 'es'] as const;
export type Locale = (typeof locales)[number];

// Emails go out in English until the user's language is stored somewhere auth-server can read it
// (the staff app keeps it in a cookie for now). Pass a `locale` to the senders in lib/emails.tsx
// once that exists.
export const defaultLocale: Locale = 'en';

export function getLocale(request: Request | undefined) {
	const localeFromCookie = request?.headers.get('cookie')?.match(/ekk_locale=([^;]+)/)?.[1] ?? 'en';
	// make sure locale is "en" | "es" | undefined
	const locale = localeFromCookie === 'en' || localeFromCookie === 'es' ? localeFromCookie : undefined;
	return locale;
}
