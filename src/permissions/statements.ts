import { createAccessControl } from 'better-auth/plugins/access';
import { adminAc, defaultStatements } from 'better-auth/plugins/admin/access';

// The only role -> permission map in the system (roles-and-permissions spec, rule 1). Other services
// never check role names: they read the computed permissions from the session (`permissions`) or
// the JWT (`perms`), both built by permissionsFor() below.
//
// `all` (members, smallGroups, guests) lifts the caller's scope: with it the other actions apply to every
// record, without it only to the caller's own groups and their active members (for guests: the guests
// in the guest groups they lead). The scope itself is enforced by membership-management.
// smallGroupReports follows the smallGroups scope. There is no `guests: delete` on purpose.
const appStatement = {
	// `setStatus` marks a member inactive or reactivates them, and is also what lets a caller see the
	// reason, note and status history (inactive-members spec, rules 4 and 5).
	members: ['all', 'view', 'search', 'create', 'update', 'link', 'setStatus'],
	membershipApplications: ['view', 'approve', 'reject'],
	smallGroups: ['all', 'view', 'create', 'update', 'close', 'setLeader', 'manageMembers'],
	smallGroupReports: ['view', 'create', 'update', 'delete', 'viewObservations'],
	// `deactivate` marks a guest inactive and is also what lets a caller see the reason, note and status
	// history on Guest detail (inactive-guests spec, rules 4 and 9). `reactivate` brings one back; leaders
	// have it so they can reactivate a returning guest while adding them to their group (rule 6). There's
	// no `setStatus` here on purpose: unlike members, the two sides go to different roles.
	guests: ['all', 'view', 'search', 'create', 'update', 'deactivate', 'reactivate'],
	invites: ['create', 'cancel'],
	// Edit the caller's own linked member (name, phone, address, birth date, sex). Every role but `pending`.
	ownProfile: ['update'],
} as const;

// Kept out of `appStatement` on purpose: elder spreads that, and this must stay admin-only. Holding
// it means "is an admin account": only such a caller can change the role of, assign a role to, or
// ban another one (user-admin-actions spec, rule 5; enforced by src/lib/admin-guard.ts).
const adminAccountsStatement = {
	adminAccounts: ['manage'],
} as const;

const statement = {
	...defaultStatements, // better-auth's own `user` / `session`, used by the admin plugin
	...appStatement,
	...adminAccountsStatement,
} as const;

export const accessControl = createAccessControl(statement);

// No statements: this role grants nothing. It's the admin plugin's `defaultRole` (see
// src/lib/auth.ts), so a freshly signed-up account can authenticate but can't do anything until an
// admin or elder assigns a real role.
export const pending = accessControl.newRole({});

export const admin = accessControl.newRole({
	...appStatement,
	...adminAccountsStatement,
	// better-auth's own built-in admin role. It deliberately leaves out `impersonate-admins`, so admins
	// can manage other admins' accounts (ban/set-role/set-password/etc.) without impersonating them.
	...adminAc.statements,
});

export const elder = accessControl.newRole({
	...appStatement,
	// `get` is needed by /admin/get-user (staff-app's /users/[id]).
	user: ['create', 'list', 'get', 'ban', 'set-role'],
});

// Signed in; can edit only their own member profile. The baseline for regular members later.
export const user = accessControl.newRole({
	ownProfile: ['update'],
});

export const smallGroupLeader = accessControl.newRole({
	members: ['view', 'search', 'update'],
	guests: ['view', 'search', 'create', 'update', 'reactivate'],
	ownProfile: ['update'],
	smallGroups: ['view', 'update', 'manageMembers'],
	smallGroupReports: ['view', 'create', 'update', 'delete'],
});

// Same as smallGroupLeader for now. A separate role so it can grow on its own.
export const deacon = accessControl.newRole({
	members: ['view', 'search', 'update'],
	guests: ['view', 'search', 'create', 'update', 'reactivate'],
	ownProfile: ['update'],
	smallGroups: ['view', 'update', 'manageMembers'],
	smallGroupReports: ['view', 'create', 'update', 'delete'],
});

// Every role the admin plugin accepts (src/lib/auth.ts) and the only valid values for user.role.
// Kept here, not in auth.ts, so scripts can validate a role without importing auth.ts (and with it
// config.ts and every app secret) - see src/scripts/set-role.ts.
export const roles = {
	admin,
	user,
	smallGroupLeader,
	deacon,
	pending,
	elder,
};

export type Permissions = Record<string, string[]>;

// A role's statements as declared, `{ resource: actions[] }`. Shipped as `permissions` in the session
// and `perms` in the JWT, so both always agree. Unknown or missing role -> `{}` (fail closed).
// Returns a copy, so callers can't mutate a role's statements.
export function permissionsFor(role: string | null | undefined): Permissions {
	// Not `role in roles`: `in` walks the prototype chain, so "toString" would pass.
	if (!role || !Object.hasOwn(roles, role)) return {};
	const statements: Record<string, readonly string[] | undefined> = roles[role as keyof typeof roles].statements;
	const permissions: Permissions = {};
	for (const [resource, actions] of Object.entries(statements)) {
		if (actions) permissions[resource] = [...actions];
	}
	return permissions;
}
