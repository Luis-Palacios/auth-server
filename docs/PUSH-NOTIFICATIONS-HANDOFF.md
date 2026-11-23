# Notifications Part 2: Web Push (auth-server)

Handoff for the auth-server side of **Web Push**: VAPID config, the subscription tables and routes,
the ban cleanup, and the push copy. The send itself (the `web-push` package, encryption, headers,
fan-out and the `channel: "push"` branch of `POST /internal/notifications`) is the **learning part**
that Luis does in the main session. Cross-repo rules: `../docs/specs/notifications.md` (rules 9, 10,
19, 20, 23 and *Contracts (Part 2: push) → auth-server*, *Copy (en / es)*). The other two handoffs:
`membership-management/docs/PUSH-NOTIFICATIONS-API-HANDOFF.md` and
`staff-app/docs/design/PUSH-NOTIFICATIONS.md`. Extends the email work in
`docs/REPORT-CONVERSATIONS-EMAIL-HANDOFF.md` (`POST /internal/notifications`, `notification_sends`,
the purge timer).

> **Split of work.** Stages 1-5 are plumbing, built by a subagent: one commit per stage, no stubs and
> no TODO functions. Stages 6-9 are Web Push specifics, done with Luis in learning mode (one change at
> a time, he decides who writes it). Nothing in stages 1-5 imports `web-push`.

**Decided (don't re-open):**

- Routes live under **`/api/push/*`**, mounted in `src/index.ts` next to `/api/custom-auth`. It does
  not collide with better-auth's `/api/auth/*` handler (different prefix), and no CORS entry is
  needed: staff-app calls them server to server, forwarding the user's `cookie` header.
- Permissions: any signed-in user manages their own subscriptions. There is no permission statement.
- `push_sends.subscription_id` is a **foreign key to `push_subscriptions.id` with `on delete
  cascade`**: a subscription deleted by a 404/410, a sign-out, the 10-per-user cap or a ban takes its
  `push_sends` rows with it, so no orphan rows and nothing to clean up by hand.
- `push_subscriptions.user_id` cascades from `user`, so deleting a user drops their subscriptions.
- The ban cleanup is a `databaseHooks.user.update.after` hook (fires for `banUser` and for
  `update-user` setting `banned`, and for any in-process caller), not an endpoint-specific hook.
- Push copy is a pure function over already validated data; the learning stage wires it in.

Branch **`feature/notifications-push`**. Each stage: `pnpm typecheck`, `pnpm test`, `pnpm build`,
`pnpm exec biome check .`.

## Progress (handoff log)

| Stage | Status | Commit |
| --- | --- | --- |
| 0. This handoff | done | `dc64bf3` |
| 1. Config: VAPID keys, subject, `PUSH_NOTIFICATIONS_ENABLED` | done | `5d2cae0` |
| 2. Tables `push_subscriptions` and `push_sends`, migration, purge | done | `ec8cf22` |
| 3. Routes `GET /api/push/config`, `PUT` and `DELETE /api/push/subscriptions` | done | `e60f7fd` |
| 4. Ban hook deletes the user's subscriptions | done | (see git log) |
| 5. Push copy (`{ title, body }`, en/es) with tests | pending | |
| 6. VAPID keys and the `web-push` package | with Luis | |
| 7. The send: payload, encryption, `TTL` / `Urgency` / `Topic` | with Luis | |
| 8. Fan-out, push-service responses, `push_sends` | with Luis | |
| 9. `channel: "push"` envelope on `POST /internal/notifications` | with Luis | |

### Decisions and deviations

- Stage 3: errors are `{ code, message }` (like `/internal`), including 401 `unauthorized`, unlike
  `custom-auth`'s `{ error }`. Extra codes: 422 `invalid_request` (bad body shape or body over 4 KB),
  500 `internal_error`. `GET /api/push/config` also needs a session (401 without).
- Stage 3: no per-route rate limit: `custom-auth` has none either (better-auth's limiter only covers
  `/api/auth/*`). Only a 4 KB body limit. Revisit with the other routes if abuse shows up.
- Stage 3: `DELETE` is not gated on `PUSH_NOTIFICATIONS_ENABLED`, so sign-out cleanup still works
  after the flag is turned off. `PUT` is (404 `push_disabled`).
- Stage 3: the 10 cap and the upsert run in one transaction under a per-user advisory lock
  (`pg_advisory_xact_lock(hashtext(user_id))`). `p256dh` must be 80-100 and `auth` 16-48 base64url
  characters, no padding. Pure validation lives in `src/notifications/push-input.ts` (tested).
- Stage 3: the authenticated paths (upsert, cap, delete) were not exercised against the DB: the
  migration isn't applied locally. Only the 401s were checked against the running dev server.
- Stage 4: better-auth runs `user.update.after` after the update is saved, so a failing cleanup
  doesn't undo the ban; banning again retries it. Not exercised against a real ban (migration not
  applied locally). `src/scripts/set-role.ts` bypasses hooks but never bans, so it's unaffected.
- `pnpm exec biome check .` fails on `.agents/` (pre-existing); the checks use `biome check src`.

## Stages 1-5 (plumbing)

1. **Config** (`src/lib/config.ts`, `.env.example`): `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`,
   `VAPID_SUBJECT` (a `mailto:` URL), `PUSH_NOTIFICATIONS_ENABLED` (default off). Flag on and any key
   missing, or a subject that isn't `mailto:` → startup fails with a clear message. Key bytes are not
   validated here (stage 6).
2. **Tables + migration** (`src/data/schemas/push.ts`): `push_subscriptions` (`id`, `user_id` FK
   cascade, `endpoint` unique, `p256dh`, `auth`, `user_agent` ≤ 200, `created_at`, `last_used_at`) and
   `push_sends` (PK `(idempotency_key, subscription_id)`, FK cascade, `status` `sent`, `created_at`).
   `src/notifications/purge.ts` also deletes `push_sends` older than 48 h in the same hourly job.
3. **Routes** (`src/routes/push/`, session cookie):
   - `GET /api/push/config` → `{ enabled, publicKey }` (`publicKey` null while off).
   - `PUT /api/push/subscriptions` `{ endpoint, keys: { p256dh, auth } }` → 204. Upsert by endpoint,
     moving it to the caller (rule 9). 422 `invalid_endpoint` (rule 10), 404 `push_disabled` while
     off, at most 10 per user (the 11th deletes the least recently used).
   - `DELETE /api/push/subscriptions` `{ endpoint }` → 204, only the caller's, idempotent.
4. **Ban hook**: `databaseHooks.user.update.after` in `src/lib/auth.ts` deletes the user's
   subscriptions when the updated user is `banned`.
5. **Push copy** (`src/notifications/push-copy.ts`): one pure function per template rendering
   `{ title, body }` in `en`/`es` from validated `data`, the strings of the spec's *Copy* table.
   Not wired to any route.

## Learning stages (with Luis, not built by the subagent)

Contract for each, from the spec (*Contracts (Part 2: push) → auth-server*):

6. **VAPID keys and `web-push`.** Add the `web-push` package, generate the VAPID key pair, set the
   three env vars, validate the key bytes at startup (stage 1 deliberately doesn't), call
   `setVapidDetails`. Push stays off (`PUSH_NOTIFICATIONS_ENABLED`) until the whole chain is deployed.
7. **The send.** Message to each subscription, encrypted (RFC 8291) and under 4 KB:
   `{ "title", "body", "path", "tag": "<idempotencyKey>", "notificationId", "badgeCount" }`.
   Title and body from stage 5's copy. Headers: `TTL: 86400`, `Urgency: normal`, `Topic` = a
   32-character base64url hash of the idempotency key.
8. **Fan-out and responses.** For each subscription of the recipient without a `push_sends` row for
   this key:

   | Push service answers | auth-server does |
   | --- | --- |
   | 201 / 2xx | writes `push_sends`, sets `last_used_at` |
   | 404, 410 | deletes the subscription |
   | 400, 413 | logs an error (a bug), skips that one |
   | 429, 5xx, timeout | counts it as transient |

   Request answer, in this order: any transient → 503 `send_failed` (retried; devices already sent
   are skipped); at least one sent, now or earlier → 200 `{ sent: n }`; none left → 404
   `no_push_subscription`.
9. **`channel: "push"` on `POST /internal/notifications`.** Envelope gains `channel` (`"email"`
   default | `"push"`); with `"push"`: `notificationId` (int | null) and `badgeCount` (int ≥ 0).
   `template`, `data` and `path` validate as for email. Old callers sending none still get email.
   Recipient must exist, be verified and not banned (same rule as email); locale from `user.locale`.
