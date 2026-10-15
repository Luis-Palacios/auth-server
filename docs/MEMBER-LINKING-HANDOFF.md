# Member linking: auth-server changes

Handoff spec for the auth-server side of **member ↔ user linking**. Read the cross-repo spec first:
`../docs/specs/member-user-linking.md` (workspace folder `members-management/docs/specs/`). It holds
the rules and the contract; this file is only what changes in auth-server.

**What this repo does:** when an invite is accepted, tell membership-management so it can link the
new user to the member with that email. Nothing else in auth-server changes: staff-app already
lists users and invites and creates invites through existing endpoints.

Work through it **stage by stage**, one reviewable commit per stage, on the
**`member-user-linking`** branch. Each stage must pass `pnpm typecheck` and
`pnpm exec biome check .`. There's no test runner, so note in *Decisions and deviations* how you
tried each stage (local run, a real invite accepted against a locally running
membership-management).

**Depends on:** `membership-management` stage "Internal accept endpoint" for the end-to-end test.
Until it exists, test the notifier against a stub server you run yourself, not committed.

## Progress (handoff log)

| Stage | Status | Commit |
| --- | --- | --- |
| 1. Config for the membership API | [x] | 0c0b329 |
| 2. Notifier | [x] | 0017a42 |
| 3. Wire it to `afterAcceptInvite` | [x] | 1a49f72 |
| 4. Docs | [x] | (this commit) |

### Decisions and deviations

- Stage 1: "required in production, optional in dev" is `.optional()` fields in the zod object plus
  three object-level `.refine`s (same style as the timeout checks): both required when
  `NODE_ENV=production`, and set together or not at all in any environment. A half-configured
  notifier fails at startup. Added `MEMBERSHIP_API_TIMEOUT_MS` (default 3000); no existing timeout fit.
  The `.env.example` lines are commented out because an empty `MEMBERSHIP_API_URL=` would fail
  `z.url`. Checked by typecheck plus starting with the variables unset, only one set, and production.
- Stage 2: tried against a throwaway stub server (not committed): 200, 500, a hanging server
  (times out after `MEMBERSHIP_API_TIMEOUT_MS`), `abortPendingNotifications()` mid-request (rejects
  immediately), connection refused, and unconfigured (debug log only). None throws; the log line has
  the `userId` and the HTTP status or error code, never the token or the email. `shutdown.ts` aborts
  pending requests first thing in the shutdown handler. The notifier does not import `shutdown.ts`
  (it would be circular), so `shutdown.ts` imports it instead.
- Stage 3, verified in better-invite 0.5.7's source (`dist/hooks.mjs`, `dist/routes/activate-invite.mjs`,
  `dist/utils.mjs`): `afterAcceptInvite` runs only after `consumeInvite` succeeds, in both accept
  paths: new account (an after-hook on sign-up, sign-in, verify-email and the like, with the user
  re-read by `findUserById` from `newSession`, so `invitedUser.id` is the real persisted id) and an
  already signed-in user via `POST /invite/activate`. It is never called for cancel or reject.
  `consumeInvite` also throws if a private invite's email doesn't include `invitedUser.email`, so the
  two emails agree for private invites; the fallback to `invitedUser.email` only matters for public ones.
- Stage 3 deviation: the option is `inviteHooks: { afterAcceptInvite }`, not a top-level
  `afterAcceptInvite` (that is how better-invite's types define it; the handoff's snippet was off).
- Stage 3 not yet run live: an accepted invite against a running membership-management needs the
  internal endpoint from that repo (and writes to the dev DB). Do it when that stage exists.
- `pnpm exec biome check .` already failed on `main` (trailing blank line at the end of
  `src/lib/auth.ts`). Fixed in stage 3, which edits that file.

## Stage 1: Config

Two new variables, read **only** through `src/lib/config.ts` (zod-validated, combined startup
error). Add them to `.env.example` with a comment.

| Variable | Meaning |
| --- | --- |
| `MEMBERSHIP_API_URL` | Base URL of membership-management, e.g. `http://127.0.0.1:8000`. Required in production; in development an unset value disables the notifier with one startup log line. |
| `INTERNAL_API_TOKEN` | Shared secret sent as `X-Internal-Token`. 32+ chars (`openssl rand -base64 32`). Same value as membership-management's `INTERNAL_API_TOKEN`. Never logged. |

Decide how "required in production, optional in dev" is expressed with the existing config
patterns (look at how `TRUSTED_PROXIES` and the production-only checks are done) and record it.

## Stage 2: Notifier

**File:** `src/lib/member-link-notifier.ts` (new).

`notifyInviteAccepted({ userId, email })`:

- `POST ${MEMBERSHIP_API_URL}/internal/member-links/accepted-invite`, JSON body
  `{ "userId": "...", "email": "..." }`, header `X-Internal-Token`.
- Timeout via `AbortSignal.timeout(...)` (a few seconds; reuse an existing timeout setting if one
  fits, else add one in config). One attempt, no retry loop.
- **Never throws.** Catch everything, log a warning with `userId` only (no token, no email in the
  log) and the status or error code. Accepting an invite must not fail because membership-management
  is down: the user then appears as a *Suggested match* and an admin links them by hand.
- No-op (debug log) when `MEMBERSHIP_API_URL` is unset in development.
- Must be closeable/abortable on shutdown the same way other holders of resources are
  (`src/lib/shutdown.ts`); a pending fetch shouldn't hold the process open past `SHUTDOWN_TIMEOUT_MS`.

## Stage 3: Wire it up

**File:** `src/lib/auth.ts`, in the `invite({...})` options add `afterAcceptInvite`:

```ts
afterAcceptInvite: async ({ invitation, invitedUser }) => {
	// fire and forget: the notifier never throws
	void notifyInviteAccepted({ userId: invitedUser.id, email: invitation.email ?? invitedUser.email });
},
```

Before relying on it, **verify in better-invite's source** (`node_modules/better-invite`) when this
hook runs for the *new account* flow: that `invitedUser.id` is the real, persisted id of the user
who just signed up through the invite (staff-app's accept-invite page activates the invite via
`POST /invite/activate`). If the hook runs before the user exists or with a different id, say so in
*Decisions and deviations* and stop; don't guess.

Use the invited user's own email when the invitation has none. Do not call it for `cancel` or
`reject`.

## Stage 4: Docs

- `CLAUDE.md`: one bullet under Architecture notes: the notifier, its two env vars, that it is
  best-effort and never throws, and that `MEMBERSHIP_API_URL`/`INTERNAL_API_TOKEN` go through
  `config.ts` like everything else.
- `ROADMAP.md`: nothing, unless you defer something.

## Not in this spec

- Retrying or queueing failed notifications. A missed notification is repaired by hand through the
  link dialog; add a retry only if that becomes common.
- Notifying on unlink or on user deletion (see D2 in the cross-repo spec).
