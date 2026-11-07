# Care and the care log: auth-server changes

Handoff for the auth-server side of **care** (*acompañamiento*) and the **care log** (*registro de
cuidado*). Read the cross-repo spec first: `../docs/specs/care.md` (workspace folder
`members-management/docs/specs/`); its rules are referred to as *rule N*.

**What this repo does:** adds two resources to `appStatement`, one per part of the feature
(rule 40). Nothing else: no table, no route, no email.
- `permissionsFor` already ships every statement in the session (`permissions`) and the JWT
  (`perms`), so the new resources reach staff-app and membership-management on the next request.
- Admins are treated exactly as elders (rule 20): both get every action through the
  `appStatement` spread. Nothing checks a role name, so splitting them later is a change here only.

Each part is its own branch, the same name in every repo: **`care-log`** for Part 1 (stage 1),
**`care`** for Part 2 (stage 2). Each stage must pass `pnpm typecheck` and
`pnpm exec biome check .`.

**Unblocks:** membership-management and staff-app. Each part starts here: stage 1 before the care
log API, stage 2 before the care API.

**Part 2 also needs** `GET /internal/users/with-permission` from report conversations Part 2
(`docs/REPORT-CONVERSATIONS-EMAIL-HANDOFF.md`, stage 3): membership-management uses it for the
owner picker (rule 27). If that endpoint isn't on `main` when Part 2 starts, say so and stop after
stage 2 here. Don't build a second endpoint for it.

## Progress (handoff log)

| Stage | Status | Commit |
| --- | --- | --- |
| 1. `careLog: all, view, create` (Part 1) | ⬜ | |
| 2. `care: all, view, create, update` (Part 2) | ⬜ | |

### Decisions and deviations

- (none yet)

## Stage 1: `careLog` (Part 1, branch `care-log`)

In `src/permissions/statements.ts`:

- `appStatement` gains `careLog: ['all', 'view', 'create']`. `admin` and `elder` get all three
  through their spread.
- `smallGroupLeader` and `deacon` get `careLog: ['view', 'create']`.
- `user` and `pending` get nothing.
- Comment on the `careLog` line of `appStatement`, in the file's style:
  - A care log entry records a call, messages, a meeting, a visit, something someone told us, or a
    note about members or guests (care spec, rules 1–13).
  - `all` lifts the scope: every entry, `Elders only` ones included. Without it, a caller sees the
    entries they wrote and the ones shared with the leaders of people in their scope (rule 8), and
    logs only about people in their scope (rule 7).
  - There's no `update` or `delete`: people edit and delete only their own entries, checked by
    authorship in membership-management (rule 10).

**Check** the same way as earlier permission changes: call `permissionsFor` for every role with
`tsx` and confirm:
- `careLog` is `['all', 'view', 'create']` for admin and elder;
- `['view', 'create']` for smallGroupLeader and deacon;
- absent for `user`, `pending`, a missing role, `null` and `"toString"`.

Note in the log whether you also checked a live session or a decoded token.

## Stage 2: `care` (Part 2, branch `care`)

In `src/permissions/statements.ts`:

- `appStatement` gains `care: ['all', 'view', 'create', 'update']`. `admin` and `elder` get all four.
- `smallGroupLeader` and `deacon` get `care: ['view', 'create', 'update']`.
- `user` and `pending` get nothing.
- Comment on the `care` line:
  - A care (*acompañamiento*) follows something going on with people: owners, status, next
    check-in, its stream of updates (care spec, rules 14–39).
  - `all` opens every care whatever its visibility, and lets the caller do what owners do
    (status, check-in, owners, visibility, editing).
  - Without `all`, which cares a caller can open is decided per care (owner, its people's leaders,
    or all leaders: rule 18), in membership-management.
  - `update` is adding updates and taking a care nobody owns; owner-only actions are checked by
    ownership on top (rule 40).

**Check:** `care` is `['all', 'view', 'create', 'update']` for admin and elder, `['view', 'create',
'update']` for smallGroupLeader and deacon, absent for `user`, `pending`, a missing role, `null` and
`"toString"`. `careLog` is unchanged.

## For the other repos

- No token re-sync: `cookieCache` is off, so the new actions show on the next request.
- staff-app: add `careLog` (`all`, `view`, `create`) and `care` (`all`, `view`, `create`, `update`)
  to the typed unions in `lib/auth/permissions.ts`. Its handoff (`docs/design/CARE.md`) covers it.
- membership-management: add the new routes to the role × route table in `docs/ARCHITECTURE.md`.
  Its handoff (`docs/CARE-API-HANDOFF.md`) covers it.
