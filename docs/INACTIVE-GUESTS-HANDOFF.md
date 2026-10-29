# Inactive guests: auth-server changes

Handoff for the auth-server side of **inactive guests**. Read the cross-repo spec first:
`../docs/specs/inactive-guests.md` (workspace folder `members-management/docs/specs/`); rules are
referred to as *rule N*.

**What this repo does:** adds two actions to `guests`, `deactivate` and `reactivate` (rule 4).
Nothing else.
- Guests have no user account (guest rule 4), so there's no ban, no unban and no admin-guard change.
- `permissionsFor` already ships every statement in the session (`permissions`) and the JWT (`perms`).

Branch **`inactive-guests`**. Must pass `pnpm typecheck` and `pnpm exec biome check .`.

**Unblocks:** membership-management (the deactivate and reactivate routes, reactivate-and-add, and
who sees reasons on Guest detail) and staff-app (*Mark as inactive*, *Reactivate…* and *Reactivate
and add*). This is the first stage of the feature in any repo.

## Progress (handoff log)

| Stage | Status | Commit |
| --- | --- | --- |
| 1. `guests: deactivate` and `guests: reactivate` | ⬜ | |

### Decisions and deviations

- (none yet)

## Stage 1: `guests: deactivate` and `guests: reactivate`

In `src/permissions/statements.ts`:

- `appStatement.guests` becomes `['all', 'view', 'search', 'create', 'update', 'deactivate',
  'reactivate']`. `admin` and `elder` get both through their spread.
- `smallGroupLeader` and `deacon`: `guests` becomes `['view', 'search', 'create', 'update',
  'reactivate']`. They do **not** get `deactivate`.
- `user` and `pending` are unchanged.
- Add a short comment on the `guests` line of `appStatement`:
  - `deactivate` marks a guest inactive and is also what lets a caller see the reason, note and
    status history on Guest detail (rules 4 and 9).
  - `reactivate` brings one back. Leaders have it so they can reactivate a returning guest while
    adding them to their group (rule 6).
  - There's no `setStatus` here on purpose: unlike members, the two sides go to different roles.

**Check** the same way as earlier permission changes. Call `permissionsFor` for every role with
`tsx` and confirm:
- `guests` includes `deactivate` and `reactivate` for admin and elder;
- it includes `reactivate` but not `deactivate` for smallGroupLeader and deacon;
- `guests` is absent for `user`, `pending`, a missing role and `"toString"`.

Note in the log whether you also checked a live session or decoded token.

## For the other repos

- membership-management and staff-app see the new actions in `perms` / `permissions` on the next
  request. No token re-sync is needed (cookieCache is off).
- staff-app: add `"deactivate" | "reactivate"` to the `guests` union in `lib/auth/permissions.ts`
  (its handoff covers it).
- membership-management: add the new routes to the role × route table in `docs/ARCHITECTURE.md`
  (its handoff covers it).
