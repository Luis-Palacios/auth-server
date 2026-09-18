import { createAccessControl } from 'better-auth/plugins/access';
import { adminAc, defaultStatements } from 'better-auth/plugins/admin/access';

const statement = {
	...defaultStatements,
	// Only `admin` and `elder` get this — both spread `...statement` directly into their role, so
	// they pick it up automatically. `smallGroupLeader`/`deacon`/`user`/`pending` build their own
	// literal statement objects below and don't spread `statement`, so they never see this key.
	dashboard: ['view'],
	persons: ['create', 'view', 'update', 'delete', 'search'],
	membershipApplications: ['create', 'view', 'update', 'delete', 'approve', 'reject'],
	smallGroups: ['create', 'view', 'update', 'delete'],
	smallGroupsReport: ['create', 'view', 'update', 'delete'],
	invites: ['create', 'cancel'],
};

export const accessControl = createAccessControl(statement);

// No statements spread in — this role grants no permissions on anything. It's the admin
// plugin's `defaultRole` (see src/lib/auth.ts), so a freshly signed-up account can authenticate
// but can't do anything until an admin assigns a real role.
export const pending = accessControl.newRole({});

export const admin = accessControl.newRole({
	...statement,
	// adminAc.statements (better-auth's own built-in admin role), spread last so it overrides
	// `statement`'s raw `...defaultStatements` on the `user`/`session` keys specifically —
	// adminAc deliberately excludes `impersonate-admins` from the full defaultStatements list,
	// so admins can manage other admins' accounts (ban/set-role/set-password/etc.) without being
	// able to impersonate them.
	...adminAc.statements,
});

export const user = accessControl.newRole({});

export const smallGroupLeader = accessControl.newRole({
    persons: ['search',],
	smallGroups: ['view', 'update'],
	smallGroupsReport: ['create', 'view', 'update', 'delete'],
});

export const deacon = accessControl.newRole({
    persons: ['search',],
	smallGroups: ['view', 'update'],
	smallGroupsReport: ['create', 'view', 'update', 'delete'],
});

export const elder = accessControl.newRole({
	...statement,
	user: ['create', 'list', 'ban', 'set-role'],
});
