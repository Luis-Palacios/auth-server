# User admin actions: auth-server changes

Handoff for the auth-server side of **user admin actions** (change role, ban, unban). Read the
cross-repo spec first: `../docs/specs/user-admin-actions.md` (workspace folder
`members-management/docs/specs/`); rules are referred to as *rule N*.

**What this repo does:** adds the admin-only `adminAccounts: ['manage']` permission (rule 5) and a
`hooks.before` guard (rules 5-7). `elder` and `admin` already hold `user: ban` and `user: set-role`
(rule 2), so no other grant changes.

Branch **`user-admin-actions`**. Must pass `pnpm typecheck` and `pnpm exec biome check .`.

**Unblocks:** staff-app.

## Progress (handoff log)

| Stage | Status | Commit |
| --- | --- | --- |
| 1. `adminAccounts` statement and guard hook | [x] | see `git log` |

### Decisions and deviations

- `adminAccounts` is declared apart from `appStatement` and given only to `admin`, so `elder` does
  not inherit it. The guard (`src/lib/admin-guard.ts`) decides "is an admin account" with
  `permissionsFor(role).adminAccounts`, not a role name; a comma-separated role counts if any part does.
- Guarded paths: `/admin/set-role`, `/admin/ban-user`, `/admin/unban-user`, and
  `/admin/create-user` and `/invite/create` (an elder has `user: create` + `set-role` and `invites: create`, so it could otherwise create or invite an admin).
- Error codes: `YOU_CANNOT_CHANGE_YOUR_OWN_ROLE` (400, everyone), `YOU_CANNOT_ASSIGN_ADMIN_ROLE` and
  `YOU_CANNOT_MANAGE_ADMIN_ACCOUNTS` (403). Self-ban is better-auth's own `YOU_CANNOT_BAN_YOURSELF`.
- Calls with no session (in-process, scripts) skip the guard.
- Checked against the local dev DB with throwaway users through `auth.api` (removed afterwards):
  elder can set user -> deacon and ban/unban a user; elder is blocked from assigning admin, changing
  an admin, banning an admin, changing their own role and creating an admin; admin can assign admin
  and ban an admin but not change their own role.
- Not covered: `/admin/update-user` (can set `role`, `banned`). Only `admin` has `user: update`, so
  an elder can't reach it. The invite path was checked by reading better-invite's body (`role`), not
  by a live call.

## For the other repos

- staff-app: add `adminAccounts` to the typed unions in `lib/auth/permissions.ts`; map the three
  new error codes to messages in `use-auth-error-message`. Hide role/ban controls on the caller's own
  row and, without `adminAccounts: manage`, on admin accounts and the `admin` option.
- No migration, no token re-sync: permissions are computed from the role on each request.
