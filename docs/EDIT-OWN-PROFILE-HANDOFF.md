# Edit own profile: auth-server changes

Handoff for the auth-server side of **edit own profile**. Read the cross-repo spec first:
`../docs/specs/edit-own-profile.md` (workspace folder `members-management/docs/specs/`); rules are
referred to as *rule N*.

**What this repo does:** adds the `ownProfile: ['update']` permission (rule 1). Nothing else:
`permissionsFor` already ships it in the session (`permissions`) and the JWT (`perms`).

Branch **`edit-own-profile`**. Must pass `pnpm typecheck` and `pnpm exec biome check .`.

**Unblocks:** membership-management (`PATCH /me/member`) and staff-app.

## Progress (handoff log)

| Stage | Status | Commit |
| --- | --- | --- |
| 1. `ownProfile` statement and roles | [x] | see `git log` |

### Decisions and deviations

- `ownProfile` is in `appStatement`, so `admin` and `elder` get it through their spread; `user`,
  `smallGroupLeader` and `deacon` list it explicitly. `pending` is unchanged (`{}`).
- Checked by calling `permissionsFor` for every role with `tsx`: `ownProfile` is `["update"]` for
  admin, elder, smallGroupLeader, deacon and user, and absent for `pending`, a missing role and
  `"toString"`. Not checked through a live sign-in, `get-session` or a decoded token.
- No migration: permissions are computed from the role on each request.

## For the other repos

- membership-management and staff-app must now see `ownProfile` in `perms` / `permissions`.
  Existing users get it on their next request; no token re-sync needed (cookieCache is off).
- staff-app: add `ownProfile` to the typed unions in `lib/auth/permissions.ts`.
