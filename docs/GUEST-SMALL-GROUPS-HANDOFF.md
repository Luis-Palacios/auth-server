# Guest small groups: auth-server changes

Handoff for the auth-server side of **guest small groups**. Read the cross-repo spec first:
`../docs/specs/guest-small-groups.md` (workspace folder `members-management/docs/specs/`); rules are
referred to as *rule N*.

**What this repo does:** adds the `guests` resource (rule 16) and grants it. Nothing else:
`permissionsFor` already ships every statement in the session (`permissions`) and the JWT (`perms`).
The per-church setting (rule 1) lives in membership-management, not here.

Branch **`guest-small-groups`**. Must pass `pnpm typecheck` and `pnpm exec biome check .`.

**Unblocks:** membership-management (every `/guests` route and the guest routes on groups) and
staff-app (the Guests menu, adding guests). This is the first stage of the feature in any repo.

## Progress (handoff log)

| Stage | Status | Commit |
| --- | --- | --- |
| 1. `guests` statement and roles | ✅ | see `git log` on `guest-small-groups` |

### Decisions and deviations

- Checked with `tsx` calling `permissionsFor` for every role: `guests` is the five actions for admin
  and elder, the four (no `all`) for smallGroupLeader and deacon, and absent for `user`, `pending`,
  a missing role, an unknown role and `"toString"`. `pnpm typecheck` and `pnpm exec biome check .`
  pass. No live session or decoded token checked.

## Stage 1: `guests` statement and roles

In `src/permissions/statements.ts`:

- `appStatement` gains `guests: ['all', 'view', 'search', 'create', 'update']`. `admin` and `elder`
  get all five through their spread (rule 16).
- `smallGroupLeader` and `deacon` list `guests: ['view', 'search', 'create', 'update']`
  explicitly, **without** `all` (their scope is the guest groups they lead, rule 17; the scope is
  enforced by membership-management).
- `user` and `pending` are unchanged: no `guests`.
- Update the comment above `appStatement`: `all` now lifts the scope for `members`, `smallGroups`
  **and** `guests`.

There is no `delete` action on purpose: deleting guests is out of v1 (rule 21).

**Check** the same way as earlier permission changes: call `permissionsFor` for every role with
`tsx` and confirm `guests` is the five actions for admin and elder, the four (no `all`) for
smallGroupLeader and deacon, and absent for `user`, `pending`, a missing role and `"toString"`.
Note in the log whether you also checked a live session or decoded token.

## For the other repos

- membership-management and staff-app will see `guests` in `perms` / `permissions` on the next
  request; no token re-sync needed (cookieCache is off).
- staff-app: add `guests: "all" | "view" | "search" | "create" | "update"` to the typed unions in
  `lib/auth/permissions.ts`.
- membership-management: add the guest routes to the role × route table in `docs/ARCHITECTURE.md`
  (its handoff covers it).
