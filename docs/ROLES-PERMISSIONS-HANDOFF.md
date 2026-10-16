# Roles and permissions: auth-server changes

Handoff spec for the auth-server side of **roles and permissions**. Read the cross-repo spec first:
`../docs/specs/roles-and-permissions.md` (workspace folder `members-management/docs/specs/`). It
holds the rules (numbered below as *rule N*); this file is only what changes in auth-server.

**What this repo does:** makes `src/permissions/statements.ts` the only role → permission map, and
ships each user's computed permissions in the session (`permissions`) and the JWT (`perms`), so
membership-management and staff-app check permissions instead of role names.

Work through it **stage by stage**, one reviewable commit per stage, on the **`roles-permissions`**
branch. Each stage must pass `pnpm typecheck` and `pnpm exec biome check .`. There's no test
runner, so note in *Decisions and deviations* how each stage was tried. Stage 2 is verified by
signing in as every role (`admin`, `elder`, `smallGroupLeader`, `deacon`, `user`, `pending`) and
reading both `GET /api/auth/get-session` and a decoded `GET /api/auth/token`.

**Unblocks:** membership-management (all stages) and staff-app (all stages) need stage 2 running
locally.

## Progress (handoff log)

| Stage | Status | Commit |
| --- | --- | --- |
| 1. Statements | [x] | (stage 1 commit) |
| 2. Ship permissions | [ ] | |
| 3. Docs | [ ] | |

### Decisions and deviations

- Stage 1: app resources live in `appStatement`; `statement` (passed to `createAccessControl`) is
  `defaultStatements` + `appStatement`. `admin` = `appStatement` + `adminAc.statements`, the same set
  as before. `elder` = `appStatement` + the `user` actions from the table. **Elder loses `session:
  list, revoke, delete`**, which it only had because it spread `defaultStatements`; the spec's table
  doesn't list it and nothing in staff-app calls the session admin endpoints.
- Stage 1: `permissionsFor` returns `Record<string, string[]>` (a `Permissions` type), not a
  resource-keyed type: the consumers are other repos reading JSON. Tried with a scratch script for
  every role plus `toString`, `''`, `null`, `undefined` (all `{}`), and that mutating the result
  doesn't touch the role.

## Stage 1: Statements

**File:** `src/permissions/statements.ts`.

Rewrite the statement to rule 5:

```ts
const statement = {
	...defaultStatements, // better-auth's user / session
	members: ['all', 'view', 'search', 'create', 'update', 'link'],
	membershipApplications: ['view', 'approve', 'reject'],
	smallGroups: ['all', 'view', 'create', 'update', 'close', 'setLeader', 'manageMembers'],
	smallGroupReports: ['view', 'create', 'update', 'delete', 'viewObservations'],
	invites: ['create', 'cancel'],
};
```

Removed: `dashboard`, `persons`, `smallGroupsReport` (renamed `smallGroupReports`), and the actions
for features that don't exist.

| Role | Grants |
| --- | --- |
| `admin` | Every app statement + better-auth `adminAc` (as today) |
| `elder` | Every app statement + `user: create, list, get, ban, set-role` (**adds `get`**: `/admin/get-user` needs it, so `/users/[id]` fails for elders today) |
| `smallGroupLeader` | `members: view, search, update` · `smallGroups: view, update, manageMembers` · `smallGroupReports: view, create, update, delete` |
| `deacon` | Same as `smallGroupLeader` (its own role object so it can diverge) |
| `user` | Nothing |
| `pending` | Nothing (admin plugin `defaultRole`, as today) |

Add `permissionsFor(role)`: takes `user.role` (`string | null | undefined`) and returns the role's
statements as declared, `Record<resource, action[]>`. Unknown or missing role → `{}` (rule 10, fail
closed). Same lookup style as `set-role.ts` (`Object.hasOwn`, never `in`). It returns a copy, so a
caller can't mutate a role's statements.

Keep working: `invites` gating in `auth.ts` (`canCreateInvite` / `canCancelInvite`) and
`routes/custom-auth/invites.ts` (`userHasPermission({ invites: ['create'] })`); names unchanged.
`set-role.ts` reads only `roles`, which keeps its keys. `emails/invite-user.tsx` uses `roles` as a
type only.

## Stage 2: Ship permissions

**File:** `src/lib/auth.ts`.

- **Session (rule 2):** add better-auth's `customSession` plugin returning
  `{ user, session, permissions: permissionsFor(user.role) }`. It replaces the `getSession`
  endpoint (HTTP `GET /api/auth/get-session` *and* in-process `auth.api.getSession`), so the result
  must still carry `user` and `session` unchanged for the in-process callers (`invites.ts`,
  `sendUserInvitation` in `auth.ts`). Pass the rest of the config as `customSession`'s second
  argument so `user.role` is typed.
- **Check before relying on it** (in better-auth's source) and record: how it interacts with the
  admin plugin, `cookieCache` (off today), and the jwt plugin's `get-session` hook.
- **JWT:** `definePayload` returns `{ role, perms: permissionsFor(user.role) }`. Payload becomes
  `{ sub, role, perms, iat, exp, iss, aud }`.
- **Verify** against a throwaway local database (not the dev one): one verified user per role,
  `get-session` shows `permissions` matching the table above and `/token` decodes to the same
  `perms`; `pending` and `user` get `{}`; the invites gating and `/api/custom-auth/invites` still
  answer 200 / 403 by role.

## Stage 3: Docs

- This file: progress log, decisions.
- `CLAUDE.md`: one bullet under Architecture notes on where permissions come from
  (`statements.ts` → `permissionsFor` → session `permissions` and JWT `perms`), and that role names
  aren't checked outside auth-server.

## Other repos (not done here)

- membership-management: read `perms` from the JWT (missing → no permissions).
- staff-app: read `permissions` from the session.
- Workspace `CLAUDE.md` "How the services talk": the JWT now carries `perms`; drop the "mirrored by
  hand" line once the other two repos are done.

## Not in this spec

See the cross-repo spec's *Not in this spec*. Nothing auth-server-specific is deferred.
