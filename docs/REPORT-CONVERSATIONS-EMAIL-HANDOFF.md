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
| 0. Handoff updated to the Nov 2026 design | ✅ | `ae18d1b` |
| 1. Recipient language: `locale` on the user | ✅ | `4700581` |
| 2. Templates: new conversation, new reply (en/es, all variants) | ✅ | `5202079` |
| 3. Internal auth, `notification_sends`, `POST /internal/notifications`, purge timer | ✅ | `be89ed6` |
| 4. User routes: `with-permission`, `permissions` | ✅ | `b8d8556` |
| 5. Docs | ✅ | (this commit) |

### Decisions and deviations

- Stage 0: the purge runs on a timer, not on insert (see *Decided*).
- Stage 1: `locale` is filled by `fillLocaleIfEmpty` in `src/lib/auth.ts`, on
  `databaseHooks.session.create.after` (every way of signing in creates a session) **and**
  `session.update.after` (better-auth extends an active session about once a day, so users who stay
  signed in for months get one too; added beyond the spec's "at sign-in", spec updated). One
  `UPDATE … WHERE locale IS NULL` (atomic, never overwrites), skipped for impersonation sessions,
  errors logged and swallowed so a sign-in or refresh never fails over it. `db` directly, not
  `internalAdapter.updateUser`, which has no "only if null".
- Stage 1: on a refresh the request is usually staff-app's server calling `get-session`, which
  forwards the `cookie` header (so `ekk_locale`) but **not `Accept-Language`**: users who never used
  the picker are only filled at their next sign-in. staff-app's Part 2 forwards `accept-language` in
  `getSession()` (noted in the spec).
- Stage 1: a refresh triggered by the language switch itself carries the *old* cookie, so it can
  store the previous language. Accepted: staff-app's `setLocale` will call `update-user`, and an
  explicit pick always overwrites.
- Stage 1: the column was added to `src/data/schemas/auth-schema.ts` by hand (the generator writes
  to the repo root by default; with `--output src/data/schemas/auth-schema.ts` it would write in
  place). Migration `drizzle/20261121151102_worthless_rhodey` (`ALTER TABLE "user" ADD COLUMN
  "locale" text`), generated by `drizzle-kit`. `CLAUDE.md`'s "no `databaseHooks` configured" note
  (set-role section) is out of date now; fixed in Stage 5 (`set-role.ts` is unaffected: the hooks are
  on sessions, not user updates).
- Stage 1 checks (local): first sign-in with `es` cookie → `es`; sign-in with `en` → still `es`;
  `update-user { locale: "en" }` → 200 and `en`; `{ locale: "fr" }` → 400 `VALIDATION_ERROR`;
  `locale` reset to null and the session made due for refresh → filled on a page load, no sign-in.
- Stage 2: the *(canvas)* rows were approved by Luis in the session (Nov 21, 2026) as written in the
  copy table, because the canvas has no boards for them yet; the canvas still needs them (watcher
  "why" line, `startedBy = leaders` title, section names, reply body for `reason ≠ participant`, all
  in Spanish). One change: the Spanish section names carry their article (*las peticiones de
  oración*, *los motivos de alabanza*, *los puntos para seguimiento de los ancianos*) and the
  sentence is "sobre {section}", so masculine sections read right ("sobre los motivos…", not "sobre
  las motivos…"). The watcher footer keeps both lines (why + unwatch, then throttle + opt-out).
- Stage 2: contract with Stage 3, all in `src/emails/report-conversation.tsx`:
  `ReportConversationEmailProps`, `ReportConversationEmail`, `reportConversationSubject(props)`. Like
  the `invite-user` pair, one component with a copy table keyed by `Locale` (every `kind`, `reason`,
  `topic` value must have copy in both languages or the typecheck fails); `report-conversation.es.tsx`
  is only the Spanish preview. Sentences with bold parts are kept as segments, so the same copy gives
  the HTML body and the plain-text inbox preview (the body sentence). `meetingDate` is formatted in
  UTC so the server's time zone can't move the day; a value that isn't `YYYY-MM-DD` is shown as given
  (Stage 3's schema rejects it first). The privacy box is local to the template (only user), not in
  `shared/`.
- Stage 2: `@react-email/ui` 6.9.5 added as an exact devDependency (same version as `react-email`):
  in react-email 6 the preview server is a separate package, and `pnpm email:dev` stops with an
  install prompt without it. It pulls in `next`, which better-auth declares as an optional peer, so
  pnpm linked it to better-auth and `pnpm install --prod` shipped `next` + `sharp` in the image
  (prod `node_modules` 143 → 463 MB, image 416 → 838 MB). `.pnpmfile.cjs` now drops better-auth's
  `next` peer as well as `drizzle-kit` (better-auth only uses it in `better-auth/next-js`, which we
  don't import): back to 143 MB / 416 MB, no `next` or `sharp` in the image, `docker build` passes.
- Stage 2 checks: every combination (new × `startedBy` × `topic`, reply × `reason`, 22 with both
  languages) rendered as plain text against the copy table, and previewed in `pnpm email:dev`
  (temporary preview files, not committed) at desktop and 375 px.
- Stage 3 files: `src/routes/internal/{auth,index,notifications}.ts`,
  `src/notifications/{templates.tsx,request-hash,recipient,send,purge}.ts`,
  `src/data/schemas/notification-sends.ts` (migration `drizzle/20261121184235_huge_absorbing_man`).
  `emails.tsx` now exports `resend` and `emailFrom` (one client, one sender); `locale.ts` exports
  `isLocale`.
- Stage 3: the token is compared as **SHA-256 digests** with `timingSafeEqual` (always 32 bytes), not
  "equal lengths first": no early exit, the length isn't leaked.
- Stage 3: validation in **three explicit steps**, each with its own code (envelope →
  `invalid_request`, template → `unknown_template`, data and path → `invalid_data`), instead of one
  `discriminatedUnion` whose errors would need digging through issue paths to pick the code. Each
  registry entry is built by `defineTemplate<T>()` (schema, allowed paths, renderer, typed end to
  end) and exposes only `validate()`, which returns the parsed data and a bound `render`. The `path`
  rule is per template. `kind` comes from the template key, never from the caller.
- Stage 3: `bodyLimit` 16 KB answers **422 `invalid_request`**, not 413, to stay inside the agreed
  status table. Any unexpected exception while sending (DB, rendering) answers **503
  `send_failed`** (retried), never a bare 500.
- Stage 3: the recipient is read with `db` (five columns), not `internalAdapter.findUserById`.
  **Unverified addresses count as `recipient_unavailable`** (beyond the handoff: they can't sign in
  to follow the link, and we never mail an unproven address). A ban whose `banExpires` has passed
  doesn't count.
- Stage 3: the request hash is SHA-256 over **canonical JSON** (keys sorted at every level) of the
  validated `{ recipientUserId, template, data, path }`, so key order never causes a false 409.
- Stage 3: `notification_sends` uses `timestamptz` (better-auth's tables use `timestamp`), a text
  `status` with a `CHECK`, an index on `created_at`, no FK to `user`. It holds the address and the
  rendered email (no comment text) for 48 h at most.
- Stage 3: the Resend call has **no timeout of its own** (the SDK takes no abort signal);
  membership-management's 5 s sender timeout bounds it, and its retry lands on the same stored row
  and key. A wrapper can come later if needed. Every Resend error except
  `invalid_idempotent_request` (409) is `send_failed` (503), including config problems such as an
  unverified sender, so queued emails go out once the config is fixed.
- Stage 3: invalid UTF-8 in the body is replaced with U+FFFD by the JSON parser, not rejected.
  Accepted: membership-management (Python) sends ASCII-escaped JSON. Seen only in a Git Bash curl
  test that sent `ó` as Latin-1.
- Stage 3 for `management-infra`: the token protects `/internal/*`, but the load balancer should
  also not route `/internal/*` from the internet (defence in depth).
- Stage 3 follow-up (copy, later): the reply subject doesn't name the group, so Gmail may thread
  several replies by the same person into one conversation. If that bothers people, add the group
  to the reply subject (canvas, then Stage 2's template). Gmail filed the test emails under
  Promotions; worth telling members once.
- Stage 3 checks (local): no/wrong token → 401 `invalid_token`; right token, unknown route → bare
  404; valid request → 200, a real email, row `sent` (locale `es`); same request again → 200, same
  id, no second email; same key, other data → 409 (and logged as an error); unknown template →
  422 `unknown_template`; `//evil.example` → 422 `invalid_data`; unknown user → 404
  `recipient_unavailable`; not JSON / extra key → 422 `invalid_request`; reply × watcher × prayer
  rendered right with accents and the `?section=prayer` link; a 49 h row purged a minute after
  start, a 47 h row kept; `node dist/index.js` + Ctrl+C → "Shutdown complete." (under `tsx watch`
  on Windows the last lines are lost, so test shutdown on the build).
- Stage 4 files: `src/routes/internal/users.ts`; helpers `isKnownPermission` and `rolesWithAll` in
  `src/permissions/statements.ts` (next to `permissionsFor`, so the role map is still read in one
  place); `onError` on the router in `src/routes/internal/index.ts`.
- Stage 4: `with-permission` takes **1–20** `permission` values (more → 422 `invalid_permission`),
  checks each against `statement` with `Object.hasOwn` (so `toString:all` is unknown, not a match),
  and the unknown name in the message is cut to 100 characters. Permissions → roles is done in code,
  then one `inArray(user.role, …)` query, sorted by id. **No paging**: staff accounts are tens, not
  thousands; add it if that changes.
- Stage 4: "banned" is `banned = true` and (`banExpires` null or in the future), the same rule
  better-auth uses at sign-in, so an expired ban counts as active again. Both routes share
  `notBanned()`. **Unverified users are not filtered** here: these routes answer "who may read",
  and an unverified account can't sign in anyway; `POST /internal/notifications` already refuses
  unverified addresses (Stage 3).
- Stage 4: `permissions` takes 1–500 ids of 1–200 characters (`strictObject`), a 64 KB `bodyLimit`
  (→ 422 `invalid_request`, like Stage 3), de-duplicates with a `Set`, and builds `users` with
  `Object.fromEntries` so an id like `__proto__` can't change the object's prototype. `pending`
  users are present with `{}`; the caller turns that into "can't read".
- Stage 4: `onError` on the `/internal` router answers **500 `{ code: "internal_error" }`** for
  anything that throws (DB down, a bug), with the error logged and never put in the body. Hono keeps
  a sub-app's `onError` for its own routes only, so `/api/auth/*` and `/health` are unchanged
  (checked with a scratch app: inside → JSON, outside → Hono's plain 500).
- Stage 4 checks (local): `smallGroups:all` → both admins + the elder; `smallGroupReports:view` → also
  the deacon and the leader, not `user`/`pending`; two permissions → only roles with both; typo or
  none → 422 `invalid_permission`; no token → 401; elder banned → left out, ban expired → back,
  un-banned after. `permissions`: admin + deacon + unknown → two entries (the JWT's `perms` shape);
  a duplicate → one; `pending` → `{}`; 501 ids, `[]`, an extra key, not JSON → 422; 70 KB → 422
  "too large". No caching: every ban change showed on the very next call.
- Stage 5: there is no `docs/ARCHITECTURE.md` in this repo, so the notes went to `CLAUDE.md`
  (*Internal API*, *Notification sends*, *Recipient language*, the schemas folder and `drizzle/`,
  and the set-role note that said no `databaseHooks` exist), the README (`/internal/*` in *API*,
  `auth generate --output src/data/schemas/auth-schema.ts` instead of "move the file") and
  `.env.example` (`INTERNAL_API_TOKEN` also guards `/internal/*`). Canvas (version 146, not in this
  repo): the "Email rules" note names the two templates and says how each email picks its language;
  `Email-NewComment` has Tweaks for `kind`, `startedBy`, `topic` and `reason` with the code's
  English copy (every variant, the real `?person=` / `?section=` link, footer "Sent by
  ekklesiaio."), `Email-NewReply` mounts it with a `reason` tweak, both 920 px tall; the Report
  conversations note no longer says the boards are still to come.

## Stage 1: Recipient language

**Decided: store it on the user** (a stored language will be needed beyond these emails anyway).
Today an email's language comes from the request (`getLocale(request)`: the `ekk_locale` cookie,
then `Accept-Language`); these emails have no browser request behind them.

- A better-auth `additionalFields` column `locale` (`'en' | 'es' | null`, not required, user-
  settable through `update-user`, validated against `locales` from `src/emails/locale.ts`).
  Migration through better-auth's schema generation (Drizzle), as for the other user fields.
- **Set on sign-in, or when an active session is extended, when still null**, from
  `getLocale(request)` (`databaseHooks.session.create.after` and `.update.after`; see *Decisions*).
  Never overwrite a stored value there: only an explicit pick changes it. If this adds a user-update `databaseHooks`, check
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
