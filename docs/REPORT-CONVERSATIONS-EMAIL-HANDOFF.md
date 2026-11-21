# Report conversations, Part 2: conversation emails (auth-server)

Handoff spec for the auth-server side of **conversation emails**: membership-management decides who
gets an email and when; auth-server looks up the recipient, renders the email in their language and
sends it through Resend. It also answers two permission questions for membership-management's
worker. Cross-repo rules: `../docs/specs/report-conversations.md` (rules 18–23 and *Contracts
(Part 2: email)*; rewritten Nov 2026, event first, generic notifications). Section threads:
`../docs/specs/prayer-follow-up.md` (*Changes for report conversations Part 2*, applied here). The
other two handoffs: `membership-management/docs/REPORT-CONVERSATIONS-EMAIL-API-HANDOFF.md` and
`staff-app/docs/design/REPORT-CONVERSATIONS-EMAIL.md`. Design:
[Staff App canvas](https://claude.ai/artifact/PLs9gdHVcigkRSAWJrsKs1), page "Report
conversations", boards `Email-NewComment` and `Email-NewReply` (plus the watcher and
leaders-started variants, see Stage 2).

> **How to work this handoff (learning mode).** Luis is using this part to learn. Claude Code shows
> **one code change at a time** (one function, one file section, one config line), explains what it
> does and why, and then **waits**. Luis decides per change: he writes it himself and Claude Code
> reviews it, or Claude Code writes it. No batching several changes into one step, no "and I'll do
> the rest". Commits stay one per stage, made when Luis says the stage is done. Docs changes (this
> file, ARCHITECTURE notes) don't need the step-by-step review.

**Decided (don't re-open):**

- auth-server is the only email sender. The `/internal/*` routes are called only by
  membership-management, authenticated with the shared `INTERNAL_API_TOKEN` in `X-Internal-Token`
  (the reverse of the existing `member-link-notifier.ts` call).
- **One generic route**, `POST /internal/notifications`, keyed by `template`. The next email type
  is a new template and schema, not a new route.
- The email never contains the comment text, the section text or the member's name. It has who
  wrote, which group, the report's date and a link.
- membership-management sends `idempotencyKey` (`mm:notification-delivery:{id}`); auth-server
  passes it to Resend unchanged. **Each key is rendered once** (`notification_sends`, Stage 3): a
  retry resends the stored request byte for byte.
- Unlike the auth emails (`send()` in `src/lib/emails.tsx` never rejects), this route **reports
  failure** through its status code and an error `code`, because the caller retries.
- Permissions come only from `permissionsFor(role)` (`statements.ts`), never from role names.
- **`notification_sends` is purged by a timer** inside the app (hourly, rows older than 48 h),
  not on insert: cleanup stays out of the send path and runs whether or not emails are being sent.
  The timer is `unref()`'d and cleared in `shutdown.ts`. Several instances running it is harmless
  (the `DELETE` is idempotent).

**Depends on:** nothing in other repos. membership-management's Part 2 (Stage 3, the auth-server
client) calls these routes, so ship this first.

Branch **`feature/report-conversations-email`** (the spec's older `report-conversations-email`
predates the branch naming rule). Each stage: `pnpm typecheck`, `pnpm exec biome check .`, the
templates previewed with `pnpm email:dev`.

## Progress (handoff log)

| Stage | Status | Commit |
| --- | --- | --- |
| 0. Handoff updated to the Nov 2026 design | ✅ | (this commit) |
| 1. Recipient language: `locale` on the user | ⬜ | |
| 2. Templates: new conversation, new reply (en/es, all variants) | ⬜ | |
| 3. Internal auth, `notification_sends`, `POST /internal/notifications`, purge timer | ⬜ | |
| 4. User routes: `with-permission`, `permissions` | ⬜ | |
| 5. Docs | ⬜ | |

### Decisions and deviations

- Stage 0: the purge runs on a timer, not on insert (see *Decided*).
- (fill in per stage)

## Stage 1: Recipient language

**Decided: store it on the user** (a stored language will be needed beyond these emails anyway).
Today an email's language comes from the request (`getLocale(request)`: the `ekk_locale` cookie,
then `Accept-Language`); these emails have no browser request behind them.

- A better-auth `additionalFields` column `locale` (`'en' | 'es' | null`, not required, user-
  settable through `update-user`, validated against `locales` from `src/emails/locale.ts`).
  Migration through better-auth's schema generation (Drizzle), as for the other user fields.
- **Set on sign-in when still null**, from `getLocale(request)` (a `databaseHooks` / `hooks.after`
  on the sign-in paths; pick the one that sees the request and note it). Never overwrite a stored
  value there: only an explicit pick changes it. If this adds a user-update `databaseHooks`, check
  `src/scripts/set-role.ts`'s note (it bypasses hooks).
- **Set when the user picks a language** in staff-app's account menu: staff-app calls
  `update-user` with `{ locale }` (staff-app handoff). Nothing else to add here beyond the field
  being settable.
- The new emails use `user.locale ?? defaultLocale`. Leave the existing auth emails on
  `getLocale(request)` (they always have a request); note under *Decisions* if you change that.
- Check: sign in with the `ekk_locale=es` cookie on a user with no locale → `es` stored; sign in
  again with `en` → still `es`; `update-user { locale: "en" }` → `en`; an invalid value → rejected.

## Stage 2: Templates

> **Blocked on the canvas for the new variants.** The `reason = watcher` lines and the
> `startedBy = leaders` title need en/es copy on the canvas boards before this stage (spec,
> *Changes to the Part 2 handoffs*, "Canvas"). The rows marked *(canvas)* below are proposals until
> the boards exist; the boards win.

**Files:** `src/emails/report-conversation.tsx`, `src/emails/report-conversation.es.tsx` (follow the
`invite-user` pair), using `shared/layout.tsx` and `shared/theme.ts`. One component per language
serving both template keys.

Template keys: `report-conversation.new`, `report-conversation.reply`. Props (from the route's
`data`, plus what auth-server adds):

| Prop | Values | Source |
| --- | --- | --- |
| `kind` | `new` \| `reply` | the template key |
| `actorName`, `groupName` | strings | `data` |
| `meetingDate` | ISO date, formatted in the template in the recipient's language, long form ("Thursday, October 8" / "jueves 8 de octubre") | `data` |
| `reason` | `leader` \| `participant` \| `watcher` | `data` |
| `topic` | `person` (a member or guest row) \| `prayer` \| `praise` \| `followUp` | `data` |
| `startedBy` | `elders` \| `leaders` (picks the "new" title) | `data` |
| `url` | `config.staffAppUrl` + `path` | auth-server |

Copy (the boards are the reference):

| | English | Español |
| --- | --- | --- |
| Subject, new | {actor} commented on a {group} report | {actor} comentó en un reporte de {group} |
| Subject, reply | {actor} replied in a conversation | {actor} respondió en una conversación |
| Eyebrow | New conversation / New reply | Nueva conversación / Nueva respuesta |
| Title, new, `startedBy = elders` | An elder commented on your group’s report | Un anciano comentó en el reporte de tu grupo |
| Title, new, `startedBy = leaders` *(canvas)* | A leader commented on a {group} report | Un líder comentó en un reporte de {group} |
| Title, reply | There’s a reply in a conversation | Hay una respuesta en una conversación |
| Body, new, `topic = person` | **{actor}** started a conversation about someone in the **{group}** report for **{date}**. | **{actor}** inició una conversación sobre alguien en el reporte de **{group}** del **{date}**. |
| Body, new, section | **{actor}** started a conversation about the **{section}** in the **{group}** report for **{date}**. | **{actor}** inició una conversación sobre las **{section}** del reporte de **{group}** del **{date}**. |
| {section} | prayer requests / praise reports / items for the elders to follow up *(canvas)* | peticiones de oración / motivos de alabanza / puntos para seguimiento de los ancianos *(canvas)* |
| Body, reply | **{actor}** replied in a conversation you’re part of, on the **{group}** report for **{date}**. | **{actor}** respondió en una conversación en la que participas, en el reporte de **{group}** del **{date}**. |
| Body, reply, `reason ≠ participant` *(canvas)* | **{actor}** replied in a conversation on the **{group}** report for **{date}**. | **{actor}** respondió en una conversación del reporte de **{group}** del **{date}**. |
| Privacy box | To protect the people in your group, comments are never included in emails. Open the conversation in ekklesiaio to read it and reply. | Para proteger a las personas de tu grupo, los comentarios nunca se incluyen en los correos. Abre la conversación en ekklesiaio para leerla y responder. |
| Button | Open the conversation | Abrir la conversación |
| Why, leader | You’re getting this because you lead {group}. | Recibes esto porque lideras {group}. |
| Why, participant | You’re getting this because you commented in this conversation. | Recibes esto porque comentaste en esta conversación. |
| Why, watcher *(canvas)* | You’re getting this because you watch {group}. To stop emails about this group, turn off Watching on the group’s page or in My profile. | Recibes esto porque sigues {group}. Para dejar de recibir correos sobre este grupo, desactiva Siguiendo en la página del grupo o en Mi perfil. |
| Throttle + opt-out | You won’t get another email about this conversation until you open it. To stop these emails, turn off Conversation emails in My profile. | No recibirás otro correo sobre esta conversación hasta que la abras. Para dejar de recibirlos, desactiva Correos de conversaciones en Mi perfil. |

"An elder commented" is the title for every elders'-side start (admins included); keep it, the
church only gives admin to elders. Add the boards' fallback-link paragraph like the invite email.
Preview every combination that changes the copy (new × startedBy × topic, reply × reason) in
`pnpm email:dev`, both languages.

## Stage 3: Internal auth, `notification_sends`, sending route, purge

**Files:** `src/routes/internal/index.ts` (new: middleware + sub-routes),
`src/routes/internal/notifications.ts`, `src/notifications/` (new: templates registry with the zod
schemas, the send logic, the purge), `src/data/schemas/` (the table), `src/index.ts`
(`app.route('/internal', internalRoute)`), `src/lib/shutdown.ts` (stop the timer).

### Internal auth middleware (`/internal/*`)

- `X-Internal-Token` compared with `crypto.timingSafeEqual` (equal-length buffers first) against
  `config.internalApiToken`. Missing config → every request is **503** `internal_api_disabled` (the
  feature is off in that environment); wrong or missing header → **401** `invalid_token`. Never
  log the header.
- Every error from `/internal/*` has the body `{ "code": "…", "message": "…" }`, so a version
  mismatch between the services shows in membership-management's logs.

### `notification_sends`

Drizzle table, migration with `drizzle-kit generate`:

| Column | Type | Notes |
| --- | --- | --- |
| `idempotency_key` | text PK | from the request |
| `recipient_user_id` | text | for logs and debugging; no FK needed, but it's the same DB, so one is allowed — decide and note it |
| `template` | text | |
| `request_hash` | text | SHA-256 of the canonical incoming body (template, recipient, data, path), to detect "same key, different payload" |
| `to_address`, `locale` | text | resolved on the first attempt |
| `resend_request` | jsonb | the exact body given to `resend.emails.send` |
| `resend_email_id` | text null | |
| `status` | text | `pending` \| `sent` |
| `created_at`, `updated_at` | timestamptz | |

Index on `created_at` (the purge).

### `POST /internal/notifications`

```jsonc
{ "idempotencyKey": "mm:notification-delivery:501",
  "recipientUserId": "u_abc",
  "template": "report-conversation.new",   // | "report-conversation.reply"
  "data": { "actorName": "Roberto Aguilar", "groupName": "Jóvenes Bello Horizonte",
            "meetingDate": "2026-10-08", "reason": "leader", "topic": "person",
            "startedBy": "elders" },
  "path": "/groups/reports/812?person=1207" }
```

- **Validation:** a zod **discriminated union on `template`**, one `data` schema per template
  (strict: unknown keys rejected). Unknown template → **422** `unknown_template`; bad `data` → **422**
  `invalid_data`; bad envelope → **422** `invalid_request`.
- **`path`** must match exactly one of `/groups/reports/{int}?person={int}`,
  `/groups/reports/{int}?guest={int}` or `/groups/reports/{int}?section=(prayer|praise|followUp)`
  (an anchored regex; never a full URL, never `//`). Anything else → **422** `invalid_data`. It's
  appended to `config.staffAppUrl`.
- **Render once per key:**
  1. Look up `notification_sends` by key.
  2. Row exists, `request_hash` differs → **409** `idempotency_conflict`.
  3. Row exists and `sent` → **200** with its `resend_email_id`, no call to Resend.
  4. Row exists and `pending` → resend its stored `resend_request` unchanged (no lookup, no render).
  5. No row → look up the user (`auth.$context` → `internalAdapter.findUserById`). Missing, banned
     (and the ban not expired), or no email → **404** `recipient_unavailable` (no row stored).
     Otherwise render with `user.locale ?? defaultLocale`, insert the row as `pending`
     (`ON CONFLICT DO NOTHING`, then re-read: two concurrent first attempts end up sending the same
     stored body), then call Resend.
- Send with `resend.emails.send(resendRequest, { idempotencyKey })`. On success: `status = 'sent'`,
  `resend_email_id`, **200** `{ "emailId": "…" }`.
- **Status codes** (the spec's table; both sides agree on this list):

  | Case | Response |
  | --- | --- |
  | Sent, or already `sent` for this key | 200 `{ emailId }` |
  | Recipient gone | 404 `recipient_unavailable` |
  | Same key, different payload (ours or Resend's `invalid_idempotent_request`) | 409 `idempotency_conflict`, logged as an error |
  | Unknown template / invalid data or request | 422 `unknown_template` / `invalid_data` / `invalid_request` |
  | Resend `concurrent_idempotent_requests`, rate limit, 5xx, network, timeout | 503 `send_failed` (transient) |
  | Token | 401 `invalid_token`; 503 `internal_api_disabled` |

  A bare 404 (no `code`) only ever comes from a missing route; membership-management treats it as
  transient. Never return a bare 404 from this route.
- Log one line per request: idempotency key, template, outcome code, Resend email id. No address,
  no names, no `data`.

### Purge timer

- `purgeOldNotificationSends()`: `DELETE FROM notification_sends WHERE created_at < now() -
  interval '48 hours'`. 48 h is longer than Resend keeps keys (24 h) and than a delivery lives
  (24 h), so no retry can need a purged row.
- Started from `src/index.ts` after the server listens: once shortly after start, then every hour
  (`setInterval(...).unref()`). Errors are logged, never thrown.
- `shutdown.ts` clears the interval (it holds a resource, per `CLAUDE.md`).

### Check

Valid request → one email, row `sent`; same request again → 200, no second Resend call; same key,
other `data` → 409; unknown template → 422; `path` `https://evil.example` or `//x` → 422; banned
user → 404 `recipient_unavailable`; Resend key wrong → 503; no token / wrong token → 401; feature
off → 503; a row older than 48 h → gone after the next purge; SIGTERM → timer cleared, clean exit.

## Stage 4: User routes

**Files:** `src/routes/internal/users.ts`, mounted under the same middleware.

- **`GET /internal/users/with-permission?permission=smallGroups:all&permission=…`** →
  `{ "userIds": [...] }`: users holding **all** the listed permissions, computed with
  `permissionsFor(user.role)`, never role names. Banned users (ban not expired) left out. Each
  `permission` is `resource:action` and must exist in `statement`; otherwise **422**
  `invalid_permission`. At least one required. Implementation: find the roles whose statements
  include all of them (from `roles`), then select users with those roles; an empty role list
  returns `[]` without a query.
- **`POST /internal/users/permissions`**, body `{ "userIds": [...] }` (1–500, strings,
  de-duplicated) → `{ "users": { "u_abc": <perms> } }`, `<perms>` from `permissionsFor`, the same
  shape as the JWT's `perms`. Unknown or banned users are absent. More than 500 → **422**
  `invalid_request`.
- There is no separate "deactivated" state in auth-server today; "banned" covers it. Note under
  *Decisions* if one is added later (both routes must leave it out).
- Check: an elder, an admin and a leader → `with-permission?permission=smallGroups:all` returns the
  first two; a banned elder isn't there; `permissions` for three ids with one unknown → two entries;
  501 ids → 422; a role change shows on the next call (no caching).

## Stage 5: Docs

`docs/ARCHITECTURE.md` (or the README section on emails) and `CLAUDE.md`'s architecture notes: the
`/internal/*` routes, their token, the error body and status codes, `notification_sends` and its
purge timer. The canvas's blue "Email rules" note (Auth & emails page) lists the templates; add
the new ones in a line. Mark this log done.

## Not in this spec

- Digests, push notifications (a later `channel` in membership-management; auth-server unchanged).
- Unsubscribe links in the email (the opt-out lives in My profile; a one-click link needs a signed
  token, later).
