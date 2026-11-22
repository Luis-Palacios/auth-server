import { eq } from 'drizzle-orm';
import { db } from '../data/database.js';
import { user } from '../data/schemas/auth-schema.js';
import { defaultLocale, isLocale, type Locale } from '../emails/locale.js';

export type Recipient = { email: string; locale: Locale };

// Who an email can go to. null = recipient_unavailable: no such user, banned (and the ban hasn't
// expired), or an unverified address (they can't sign in to open the link, and we never mail an
// address nobody has proven they own). auth-server has no separate "deactivated" state: a ban is it.
export async function findRecipient(userId: string): Promise<Recipient | null> {
	const [row] = await db
		.select({
			email: user.email,
			emailVerified: user.emailVerified,
			banned: user.banned,
			banExpires: user.banExpires,
			locale: user.locale,
		})
		.from(user)
		.where(eq(user.id, userId))
		.limit(1);

	if (!row?.emailVerified) return null;
	if (row.banned && (row.banExpires === null || row.banExpires > new Date())) return null;
	return { email: row.email, locale: isLocale(row.locale) ? row.locale : defaultLocale };
}
