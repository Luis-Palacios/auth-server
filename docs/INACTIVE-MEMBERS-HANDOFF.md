# Inactive members: auth-server changes

Handoff for the auth-server side of **inactive members**. Read the cross-repo spec first:
`../docs/specs/inactive-members.md` (workspace folder `members-management/docs/specs/`); rules are
referred to as *rule N*.

**What this repo does:** adds the `setStatus` action to `members` (rule 4). Nothing else.
- Turning off sign-in reuses the existing ban (`/admin/ban-user`, `user-admin-actions.md`), called by
  staff-app. No new endpoint, no internal route, no change to the admin guard.
- `permissionsFor` already ships every statement in the session (`permissions`) and the JWT (`perms`).

Branch **`inactive-members`**. Must pass `pnpm typecheck` and `pnpm exec biome check .`.

**Unblocks:** membership-management (the deactivate, reactivate and history routes, and who sees
reasons) and staff-app (the *Mark as inactive* and *Reactivate* actions). This is the first stage of
the feature in any repo.

## Progress (handoff log)

| Stage | Status | Commit |
| --- | --- | --- |
| 1. `members: setStatus` | ⬜ | |

### Decisions and deviations

- [Fill in after the stage: how it was checked.]

## Stage 1: `members: setStatus`

In `src/permissions/statements.ts`:

- `appStatement.members` becomes `['all', 'view', 'search', 'create', 'update', 'link', 'setStatus']`.
  `admin` and `elder` get it through their spread.
- `smallGroupLeader` and `deacon` keep their explicit `members: ['view', 'search', 'update']`.
  They do **not** get `setStatus`.
- `user` and `pending` are unchanged.
- Add a short comment on the `members` line: `setStatus` marks a member inactive or reactivates
  them, and is also what lets a caller see the reason, note and status history (rules 4 and 5).

**Check** the same way as earlier permission changes. Call `permissionsFor` for every role with
`tsx` and confirm:
- `members` includes `setStatus` for admin and elder;
- it does not for smallGroupLeader and deacon;
- `members` is absent for `user`, `pending`, a missing role and `"toString"`.

Note in the log whether you also checked a live session or decoded token.

## For the other repos

- membership-management and staff-app see `setStatus` in `perms` / `permissions` on the next
  request. No token re-sync is needed (cookieCache is off).
- staff-app: add `"setStatus"` to the `members` union in `lib/auth/permissions.ts` (its handoff
  covers it).
- membership-management: add the new routes to the role × route table in `docs/ARCHITECTURE.md`
  (its handoff covers it).
