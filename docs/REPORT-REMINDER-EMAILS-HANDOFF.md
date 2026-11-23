# Report reminder emails (auth-server)

Handoff for the auth-server side of **report reminder emails**: a new `report.reminder` template
on the existing `POST /internal/notifications` route, with three allowed report links. Cross-repo
rules and contracts: `../docs/specs/report-reminder-emails.md` (rules 16-19, *Contracts →
auth-server*). The other two handoffs: `membership-management/docs/REPORT-REMINDER-EMAILS-API-HANDOFF.md`
and `staff-app/docs/design/REPORT-REMINDER-EMAILS.md`. Route, validation steps, `notification_sends`
and status codes are unchanged (`docs/REPORT-SUBMITTED-EMAILS-HANDOFF.md`).

**Depends on:** nothing in other repos. membership-management builds in parallel: the spec fixes the
template key, strict `data` schema and path patterns between them.

Branch **`feature/report-reminder-emails`**. Each stage: `pnpm typecheck`, `pnpm exec biome check src`,
`pnpm test`, `pnpm build`.

## Progress (handoff log)

| Stage | Status | Commit |
| --- | --- | --- |
| 0. Handoff | [x] | written by the workspace session after Stage 2 (the subagent's write was refused) |
| 1. Template, schema, path and en/es email components | [x] | `7c3a5d5` |
| 2. Tests | [x] | `68dc9b6` |

### Decisions and deviations

- Verse rotation: whole days from 1970-01-01 to `weekStart` (UTC), divided by 7 and floored, modulo
  7. `weekStart` is a church Sunday, so each church week moves to the next entry. The groups arrive
  already sorted from membership-management and are not re-sorted here.
- Variant: `groups.length > 1` is the multi-group email; otherwise `groups[0].hasDraft` picks
  single-draft or single-no-draft. The template does not check that `path` agrees with the variant;
  membership-management picks the path (spec rule 17).
- Apostrophes are typographic (*Don’t*, *You’re*, *week’s*), like the other emails; the spec's
  em dash in "yet—when" and the " — " before a reference/draft suffix are kept as written.
- The multi-group list shows the group name in bold (`Strong`) as a `<ul>`; the draft suffix is plain.
  The verse callout is a left-bordered (gold) `Text` with the quote in italics.
- Stage 2: tests also pin the rotation (1970-01-04 → entry 1, one entry per week, wraps after 7, same
  entry in en and es) and that the order of `groups` is kept as sent.
- `pnpm exec biome check .` (whole repo) still fails on tracked files outside `src/` (`.claude/`
  hooks, `.agents/...`), as in the report-submitted handoff; `pnpm exec biome check src` is clean.
- The handoff was written by the workspace session from the subagent's returned text, because
  Claude Code refused the subagent's new `.md` as a "report file".

## Stage 1: Template, schema, path and email components

**Files:** `src/emails/report-reminder.tsx`, `src/emails/report-reminder.es.tsx` (Spanish preview),
`src/notifications/templates.tsx`.

- `report.reminder` in `notificationTemplates` with the spec's strict Zod schema and anchored path
  regex, copied exactly.
- Email component with a copy table keyed by `Locale`: eyebrow, subject/heading, body, group list
  (multi), the seven-entry Scripture callout, button and footer, word for word from spec rule 19.
- No pastoral or report content (rule 16).

## Stage 2: Tests

**Files:** `src/notifications/templates.test.tsx`: valid payloads (single no-draft, single draft,
multi mixed), invalid `data` / `path`, deterministic verse rotation from `weekStart`, en and es
rendering.
