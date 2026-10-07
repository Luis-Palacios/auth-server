import { parseArgs } from 'node:util';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Client } from 'pg';
import { z } from 'zod';
import { user } from '../data/schemas/auth-schema.js';
import { roles } from '../permissions/statements.js';

// One-off admin process: `node dist/scripts/set-role.js <email> <role>`, run as an ECS task from the
// app's own task definition (role changes are DML, so the app's DB user is enough). Used to promote
// the first admin after they sign up normally, and as the break-glass fix if every admin loses access.
//
// It updates user.role directly instead of going through better-auth: auth.api.setRole requires an
// admin session, which a break-glass script doesn't have, and importing lib/auth.ts would pull in
// lib/config.ts and every app secret. The trade-off: better-auth's databaseHooks don't run here (none
// are configured today - revisit this script if one is added on user update).
//
// The change is visible on the user's next request, because session.cookieCache is off and
// getSession reads the user row every time. Turning cookieCache on would delay it by up to its maxAge.
// JWTs already issued keep the old role until they expire (15 min). Sessions are not revoked: to lock
// out a compromised account, ban it instead.

type Role = keyof typeof roles;

const USAGE = 'Usage: node dist/scripts/set-role.js <email> <role>';

function isRole(value: string): value is Role {
	// Not `value in roles`: `in` walks the prototype chain, so "toString" would pass.
	return Object.hasOwn(roles, value);
}

// Exit code 2 for usage errors (bad arguments), 1 for failures at run time. process.exit() is safe
// here because nothing is open yet.
function usageError(message: string): never {
	console.error(`${message}\n${USAGE}\nValid roles: ${Object.keys(roles).join(', ')}`);
	process.exit(2);
}

function parseCliArgs(): { email: string; role: Role } {
	let positionals: string[];
	try {
		({ positionals } = parseArgs({ allowPositionals: true, strict: true }));
	} catch (error) {
		return usageError(error instanceof Error ? error.message : String(error));
	}

	const [email, role, ...extra] = positionals;
	if (email === undefined || role === undefined || extra.length > 0) {
		return usageError('Expected exactly two arguments.');
	}
	if (!isRole(role)) {
		return usageError(`Unknown role "${role}".`);
	}
	// better-auth lowercases emails at sign-up, so match on the same form.
	return { email: email.trim().toLowerCase(), role };
}

// Arguments are checked before the environment and the DB, so a typo fails fast without connecting.
const { email, role } = parseCliArgs();

const env = z
	.object({
		DATABASE_URL: z.string().min(1, 'DATABASE_URL must be set (see .env.example)'),
	})
	.safeParse(process.env);

if (!env.success) {
	throw new Error(`Invalid environment configuration:\n${z.prettifyError(env.error)}`);
}

const client = new Client({
	connectionString: env.data.DATABASE_URL,
	connectionTimeoutMillis: 5_000,
});

try {
	await client.connect();
	const db = drizzle({ client });

	// Read and write in one transaction, with the row locked (FOR UPDATE): if someone changes the role
	// in staff-app between the read and the write, the logged "old role" would otherwise be wrong.
	const outcome = await db.transaction(async (tx) => {
		const [found] = await tx
			.select({ id: user.id, role: user.role, emailVerified: user.emailVerified })
			.from(user)
			.where(eq(user.email, email))
			.for('update');

		if (!found) return { kind: 'not-found' } as const;
		if (!found.emailVerified) return { kind: 'unverified' } as const;
		if (found.role === role) return { kind: 'unchanged', id: found.id } as const;

		await tx.update(user).set({ role }).where(eq(user.id, found.id));
		return { kind: 'changed', id: found.id, oldRole: found.role } as const;
	});

	// Logged only after the transaction has committed. This line is the audit record in CloudWatch;
	// who ran the task is in CloudTrail (ecs:RunTask).
	switch (outcome.kind) {
		case 'not-found':
			console.error(`No user with email ${email}. They must sign up in staff-app first.`);
			process.exitCode = 1;
			break;
		case 'unverified':
			console.error(`${email} hasn't verified their email address yet. Refusing to assign a role.`);
			process.exitCode = 1;
			break;
		case 'unchanged':
			console.log(`Role unchanged: ${email} (${outcome.id}) is already ${role}`);
			break;
		case 'changed':
			console.log(`Role changed: ${email} (${outcome.id}) ${outcome.oldRole ?? '(none)'} -> ${role}`);
			break;
	}
} catch (error) {
	console.error('set-role failed:', error);
	process.exitCode = 1;
} finally {
	await client.end();
}
