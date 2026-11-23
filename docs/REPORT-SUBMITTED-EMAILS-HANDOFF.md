# Report submitted emails (auth-server)

Handoff for the auth-server side of **report submitted emails**: a new `report.submitted` template
on the existing `POST /internal/notifications` route, and the report link it points to. Cross-repo
rules and contracts: `../docs/specs/report-submitted-emails.md` (rules 12–13, *Contracts →
auth-server*). The other two handoffs: `membership-management/docs/REPORT-SUBMITTED-EMAILS-API-HANDOFF.md`
and `staff-app/docs/design/REPORT-SUBMITTED-EMAILS.md`. It reuses everything Part 2 of report
conversations built (`docs/REPORT-CONVERSATIONS-EMAIL-HANDOFF.md`): route, validation steps,
`notification_sends`, status codes. None of that changes.

**Depends on:** nothing in other repos. membership-management's consumer calls this template, so ship
this first.

Branch **`feature/report-submitted-emails`**. Each stage: `pnpm typecheck`, `pnpm exec biome check .`,
`pnpm test` (from Stage 2).

## Progress (handoff log)

| Stage | Status | Commit |
| --- | --- | --- |
| 0. Handoff | [x] | `e3d36e5` |
| 1. Email template `report-submitted.tsx` (en/es) | [x] | `88032ee` |
| 2. Registry entry, report link, tests | [x] | `105186f` |
| 3. Docs | [x] | (this commit) |

### Decisions and deviations

- Stage 1: the spec gives subject, body, button and why line, not the **eyebrow and heading** the
  email shell needs. Eyebrow *Report submitted* / *Reporte enviado* (both variants); the heading is
  the subject, as the reply email's title restates its subject. No privacy box (the conversation
  emails explain why comments are left out; here there's nothing left out the reader would look
  for) and no throttle line (rule 8, no throttle). Canvas has no board yet (spec, *Design*).
- Stage 1: apostrophes are typographic (*didn’t*, *You’re*), like every other email; the spec
  writes them straight. The why line is plain text (no bold), as the spec writes it.
- Stage 1: `formatMeetingDate` and the bold-segment helpers (`Segment`, `toText`, `Segments`) moved
  from `report-conversation.tsx` to `src/emails/shared/` (`meeting-date.ts`, `segments.tsx`), so
  both emails format dates the same way. No change to the conversation emails' output.
- Stage 2: `data` is a `z.discriminatedUnion('held', …)` of two strict objects, so counts with
  `held: false`, a missing count with `held: true`, or no `held` all fail as `invalid_data`.
  Beyond the spec: counts are ints 0–10 000 and `attendedCount <= peopleCount` (attended rows are a
  subset of the report's rows). Zero people is allowed.
- Stage 2: `report.submitted` accepts only `/groups/reports/{id}` (anchored, id without leading
  zero, no trailing slash, query or fragment); the conversation templates don't accept it. The path
  rule stays per template, as Part 2 decided.
- Stage 2: **first tests in the repo**. The other handoffs had no runner and noted manual checks;
  this one adds `pnpm test` (Node's `node:test` through `tsx --test`, no new dependency) with
  `src/notifications/templates.test.tsx`: valid held / not-held payloads, 19 invalid ones, the new
  path and 16 wrong ones, the conversation templates' paths unchanged, and the plain-text render of
  both variants in both languages (also run under `TZ=Pacific/Kiritimati` and `Pacific/Pago_Pago`:
  the date doesn't move). `tsconfig.build.json` excludes `*.test.ts(x)` so they stay out of `dist/`
  and the image.
- Not checked here: `pnpm email:dev` preview and a real send through the route (the route and
  `notification_sends` are unchanged; membership-management's consumer will exercise it).
- `pnpm exec biome check .` fails on `main` already, on tracked files outside `src/` (`.claude/`
  hooks and settings, `.agents/skills/github-pr-review/scripts/gh-as-bot.cjs`: formatting, one
  `useOptionalChain`). Not touched here; `pnpm exec biome check src` is clean.

## Stage 1: Email template

**Files:** `src/emails/report-submitted.tsx`, `src/emails/report-submitted.es.tsx` (Spanish preview),
following the `report-conversation` pair: one component with a copy table keyed by `Locale`,
segments for the bold parts, `reportSubmittedSubject(props)`.

Props: `submitterName`, `groupName`, `meetingDate` (ISO date, formatted like the conversation emails:
"Thursday, October 8" / "jueves 8 de octubre", UTC), `held` with `attendedCount` and `peopleCount`
when true, `reason` (`watcher`), plus `url` and `locale` from auth-server.

Copy: spec rule 13, word for word (subjects, bodies, *Open report* / *Abrir reporte*, why line). No
report free text, no member names (rule 12).

## Stage 2: Registry entry, report link, tests

**Files:** `src/notifications/templates.tsx`, tests next to it.

- `report.submitted` in `notificationTemplates`. `data` is strict; `held: true` requires
  `attendedCount` and `peopleCount`, `held: false` forbids them. Anything else → 422 `invalid_data`
  (the route's existing step 3).
- Its only allowed `path` is `/groups/reports/{id}` (no query, anchored). The conversation
  templates keep their three shapes and don't accept this one.
- Tests: valid held and not-held payloads, invalid combinations, the new path and nearby wrong
  ones, rendering in both languages.

## Stage 3: Docs

`CLAUDE.md` (*Internal API*: templates on the route; the test command). Mark this log done.
