# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project state

This is an early-stage but now-running service. `src/lib/auth.ts` configures `betterAuth(...)`
with a Drizzle/PostgreSQL adapter (`src/data/database.ts`, `src/data/schemas/auth-schema.ts`),
rate limiting, and the `admin`, `jwt`, and `openAPI` plugins. `src/index.ts` mounts the auth
handler on a Hono app (`/api/auth/*`) plus a health-check route (`src/routes/health.ts`), and
serves it via `@hono/node-server`. All environment configuration is centralized and validated in
`src/lib/config.ts` — never read `process.env` directly elsewhere. Treat this as the foundation
of a standalone auth microservice within the larger `members-management` project (sibling
directory: `../membership-applications`), not as a finished product — there's still no
`build`/`dev`/`start` script. `ROADMAP.md` tracks the in-progress production-readiness hardening
work (connection pooling, HTTP timeouts, rate limiting, graceful shutdown, etc.) one phase at a
time; pick up at whichever phase is still marked `[ ]`.

## Commands

Package manager is pnpm (pinned via `packageManager`/`devEngines` to `pnpm@12.3.4`). Use pnpm,
not npm/yarn.

```bash
pnpm install                      # install dependencies
pnpm exec biome check .           # lint (Biome, not ESLint/Prettier)
pnpm exec biome check --write .   # lint + auto-fix
pnpm exec biome format --write .  # format only
pnpm exec tsc --noEmit            # type-check
pnpm exec tsx src/lib/auth.ts     # run a TS file directly during development

pnpm drizzle-kit generate   # generate migrations
pnpm drizzle-kit migrate    # run migrations

pnpm dlx auth@latest generate # generate auth-migrations
pnpm dlx auth@latest create-admin --email admin@example.com --name "Admin" --role admin # create admin user

bun ./src/data/seed.ts # seed database
bun ./src/index.ts     # run the Hono API
```

There is no real `test` script yet (`package.json`'s `test` script is a placeholder that exits
with an error) and no `build`/`dev`/`start` script defined — don't assume one exists.

## Architecture notes

- **Config**: every environment variable is read once and validated with `zod` in
  `src/lib/config.ts`, which throws a combined error report on startup if anything's
  missing/invalid, and exports a single typed `config` object (see `.env.example` for the full
  list and defaults).
- **Auth**: built on [`better-auth`](https://www.better-auth.com/), configured in
  `src/lib/auth.ts` via `betterAuth(...)` with a Drizzle/PostgreSQL adapter, rate limiting
  (`rateLimit.window`/`.max`, tunable via `RATE_LIMIT_WINDOW_SECONDS`/`RATE_LIMIT_MAX` — enabled
  only when `NODE_ENV=production`, which is better-auth's own default and not overridden here),
  and the `admin`, `jwt` (JWKS served at `/.well-known/jwks.json`), and `openAPI` plugins.
  `BETTER_AUTH_SECRET` (32+ chars, high entropy — `openssl rand -base64 32`), `BETTER_AUTH_URL`,
  and `DATABASE_URL` are read via `config`; `.env` is gitignored and never committed.
- **API/HTTP**: `src/index.ts` mounts `auth.handler` on a [Hono](https://hono.dev/) app at
  `/api/auth/*` (all methods) and a `GET /health` route (`src/routes/health.ts` — debounced DB
  check plus connection-pool stats), served with `@hono/node-server` on the port derived from
  `BETTER_AUTH_URL`. CORS is enabled app-wide via `hono/cors`. The underlying `http.Server` has
  `requestTimeout`/`headersTimeout`/`keepAliveTimeout` configured so a slow/stalled client can't
  hold a connection open indefinitely (see `REQUEST_TIMEOUT_MS` etc. in `.env.example`). Since no
  reverse proxy sits in front of this service yet, `src/index.ts` also overwrites
  `X-Forwarded-For` with the real TCP peer address before better-auth's rate limiter sees it
  (otherwise a direct client could spoof that header to bypass rate limiting) — controlled by
  `TRUST_PROXY`, which should only flip to `true` once a real reverse proxy exists.
- **Database**: Drizzle ORM against PostgreSQL, schema in `src/data/schemas/auth-schema.ts`.
  `src/data/database.ts` constructs the `pg.Pool` explicitly (rather than via drizzle's
  `connection` shorthand) so it can also export `pool` directly for health-check stats; pool
  size/timeouts are configurable via `DB_POOL_MAX`/`DB_IDLE_TIMEOUT_MS`/`DB_CONNECTION_TIMEOUT_MS`.
  Seed script in `src/data/seed.ts` (run with `bun`, not Node/tsx).
- **Module system**: ESM throughout (`"type": "module"` in `package.json`), TypeScript compiled
  with `module: nodenext` / `target: esnext`. `verbatimModuleSyntax` and `isolatedModules` are on,
  so use explicit `import type` for type-only imports.
- **TypeScript strictness**: `strict`, `noUncheckedIndexedAccess`, and
  `exactOptionalPropertyTypes` are all enabled — code must satisfy these, not just base `strict`.
- **Formatting/linting**: Biome only (`biome.json`: single quotes, 120-char line width). No
  ESLint/Prettier config exists — don't add one.
