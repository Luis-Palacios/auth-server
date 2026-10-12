export const locales = ['en', 'es'] as const;
export type Locale = (typeof locales)[number];

// Resolve the email language from the staff app's locale cookie when the callback carries a request.
// Missing or unsupported values fall back to the default locale in the email sender.
export const defaultLocale: Locale = 'en';

export function getLocale(request: Request | undefined) {
	const localeFromCookie = request?.headers.get('cookie')?.match(/ekk_locale=([^;]+)/)?.[1] ?? 'en';
	// make sure locale is "en" | "es" | undefined
	const locale = localeFromCookie === 'en' || localeFromCookie === 'es' ? localeFromCookie : undefined;
	return locale;
}
