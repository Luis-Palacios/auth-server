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
| 0. Handoff | [ ] | |
| 1. Email template `report-submitted.tsx` (en/es) | [ ] | |
| 2. Registry entry, report link, tests | [ ] | |
| 3. Docs | [ ] | |

### Decisions and deviations

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
