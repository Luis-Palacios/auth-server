# Report conversations, Part 2: conversation emails (auth-server)

Handoff spec for the auth-server side of **conversation emails**: membership-management decides who
gets an email and when; auth-server looks up the recipient, renders the email in their language and
sends it through Resend. Cross-repo rules: `../docs/specs/report-conversations.md` (*Contracts
(Part 2: email)*). The other two handoffs: `membership-management/docs/REPORT-CONVERSATIONS-EMAIL-API-HANDOFF.md`
and `staff-app/docs/design/REPORT-CONVERSATIONS-EMAIL.md`. Design: [Staff App canvas](https://claude.ai/artifact/PLs9gdHVcigkRSAWJrsKs1),
page "Report conversations", boards `Email-NewComment` and `Email-NewReply`.

> **How to work this handoff (learning mode).** Luis is using this part to learn. Claude Code shows
> **one code change at a time** (one function, one file section, one config line), explains what it
> does and why, and then **waits**. Luis decides per change: he writes it himself and Claude Code
> reviews it, or Claude Code writes it. No batching several changes into one step, no "and I'll do
> the rest". Commits stay one per stage, made when Luis says the stage is done.

**Decided (don't re-open):**

- auth-server is the only email sender. This route is called only by membership-management,
  authenticated with the shared `INTERNAL_API_TOKEN` in `X-Internal-Token` (the reverse of the
  existing `member-link-notifier.ts` call).
- The email never contains the comment text or the member's name. It has who wrote, which group,
  the report's date and a link.
- The **notification id is the Resend idempotency key** (`report-conversation/{notificationId}`).
  membership-management retries with the **same payload**, so a retry after a timeout that actually
  sent never becomes a second email. Resend keeps keys 24 hours; the API's retries end well inside
  that.
- Unlike the auth emails (`send()` in `src/lib/emails.tsx` never rejects), this route **reports
  failure** through its status code, because the caller retries.

**Depends on:** nothing new in other repos for stages 1–3. membership-management's Stage 3 calls this
route, so ship this first.

Branch **`report-conversations-email`**. Each stage: `pnpm typecheck`, `pnpm lint` (if configured),
the templates previewed with `pnpm email:dev`.

## Progress (handoff log)

| Stage | Status | Commit |
| --- | --- | --- |
| 1. Recipient language: `locale` on the user | ⬜ | |
| 2. Templates: new conversation, new reply (en/es) | ⬜ | |
| 3. Internal route and sending | ⬜ | |
| 4. Docs | ⬜ | |

### Decisions and deviations

- (fill in per stage)

## Stage 1: Recipient language

**Decided: store it on the user** (option A; a stored language will be needed beyond these emails
anyway). Today an email's language comes from the request (`getLocale(request)`: the `ekk_locale`
cookie, then `Accept-Language`); these emails have no browser request behind them.

- A better-auth `additionalFields` column `locale` (`'en' | 'es' | null`, not required, user-
  settable through `update-user`, validated against `locales`). Migration through better-auth's
  schema generation (Drizzle), as for the other user fields.
- **Set on sign-in when still null**, from `getLocale(request)` (a `databaseHooks` / `hooks.after`
  on the sign-in paths; pick the one that sees the request and note it). Never overwrite a stored
  value there: only an explicit pick changes it.
- **Set when the user picks a language** in staff-app's account menu: staff-app calls
  `update-user` with `{ locale }` (staff-app handoff, Stage 4). Nothing else to add here beyond the
  field being settable.
- The new email uses `user.locale ?? defaultLocale`. Leave the existing auth emails on
  `getLocale(request)` (they always have a request); note under *Decisions* if you change that.
- Check: sign in with the `ekk_locale=es` cookie on a user with no locale → `es` stored; sign in
  again with `en` → still `es`; `update-user { locale: "en" }` → `en`; an invalid value → rejected.

## Stage 2: Templates

**Files:** `src/emails/report-conversation.tsx`, `src/emails/report-conversation.es.tsx` (follow the
`invite-user` pair), using `shared/layout.tsx` and `shared/theme.ts`.

Props: `kind: 'new' | 'reply'`, `actorName`, `groupName`, `meetingDate` (ISO date; format it in the
template in the recipient's language, long form: "Thursday, October 8" / "jueves 8 de octubre"),
`url`, `reason` (`'leader' | 'participant'`), `locale`.

Copy (the boards are the reference):

| | English | Español |
| --- | --- | --- |
| Subject, new | {actor} commented on a {group} report | {actor} comentó en un reporte de {group} |
| Subject, reply | {actor} replied in a conversation | {actor} respondió en una conversación |
| Eyebrow | New conversation / New reply | Nueva conversación / Nueva respuesta |
| Title, new | An elder commented on your group’s report | Un anciano comentó en el reporte de tu grupo |
| Title, reply | There’s a reply in a conversation | Hay una respuesta en una conversación |
| Body, new | **{actor}** started a conversation about someone in the **{group}** report for **{date}**. | **{actor}** inició una conversación sobre alguien en el reporte de **{group}** del **{date}**. |
| Body, reply | **{actor}** replied in a conversation you’re part of, on the **{group}** report for **{date}**. | **{actor}** respondió en una conversación en la que participas, en el reporte de **{group}** del **{date}**. |
| Privacy box | To protect the people in your group, comments are never included in emails. Open the conversation in ekklesiaio to read it and reply. | Para proteger a las personas de tu grupo, los comentarios nunca se incluyen en los correos. Abre la conversación en ekklesiaio para leerla y responder. |
| Button | Open the conversation | Abrir la conversación |
| Why, leader | You’re getting this because you lead {group}. | Recibes esto porque lideras {group}. |
| Why, participant | You’re getting this because you commented in this conversation. | Recibes esto porque comentaste en esta conversación. |
| Throttle + opt-out | You won’t get another email about this conversation until you open it. To stop these emails, turn off Conversation emails in My profile. | No recibirás otro correo sobre esta conversación hasta que la abras. Para dejar de recibirlos, desactiva Correos de conversaciones en Mi perfil. |

"An elder commented" is the title for every elders'-side start (admins included); keep it, the
church only gives admin to elders. Add the boards' fallback-link paragraph like the invite email.

## Stage 3: Internal route and sending

**Files:** `src/routes/internal/index.ts` (new), `src/routes/internal/notifications.ts`,
`src/lib/emails.tsx` (a new exported function that **returns** the outcome), `src/index.ts`
(`app.route('/internal', internalRoute)`), `src/lib/config.ts`.

- **Auth middleware** on `/internal/*`: `X-Internal-Token` compared with `crypto.timingSafeEqual`
  (equal-length buffers first) against `config.internalApiToken`. Missing config → every request is
  503 (the feature is off), wrong or missing header → 401. Never log the header.
- `POST /internal/notifications/report-conversation`, body validated with zod:

  ```jsonc
  { "notificationId": 9123, "recipientUserId": "u_abc", "kind": "new" | "reply",
    "reason": "leader" | "participant", "actorName": "Roberto Aguilar",
    "groupName": "Jóvenes Bello Horizonte", "meetingDate": "2026-10-08",
    "path": "/groups/reports/812?person=1207" }
  ```

  `path` must start with `/` and not `//` (it's appended to `config.staffAppUrl`; never accept a
  full URL).
- Look up the user (`auth.$context` → `internalAdapter.findUserById`). Missing, banned, or no email
  → **410** `recipient unavailable` (the API stops retrying that row).
- Render subject/HTML/text and send with
  `resend.emails.send(payload, { idempotencyKey: \`report-conversation/${notificationId}\` })`.

| Outcome | Response | The API does |
| --- | --- | --- |
| Sent (or Resend returned the original send for this key) | 200 `{ "emailId": "…" }` | `sent` |
| Body invalid | 422 | `dead` |
| Recipient missing / banned | 410 | `dead` (`skipped`) |
| Resend `invalid_idempotent_request` (same key, different payload: a bug) | 409 | `dead`, logged loudly |
| Resend `concurrent_idempotent_requests`, rate limit, 5xx, network | 503 | `failed`, retried |

- Log one line per request: notification id, kind, outcome, Resend email id. No recipient address,
  no names.

## Stage 4: Docs

`docs/ARCHITECTURE.md` (or the README section on emails): the internal route, its token, its status
codes. The canvas's blue "Email rules" note (Auth & emails page) lists the templates; add the new
one in a line. Mark this log done.

## Not in this spec

- Digests, push notifications, other notification kinds (the route name leaves room for them).
- Unsubscribe links in the email (the opt-out lives in My profile; a one-click link needs a signed
  token, later).
