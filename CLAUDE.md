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
directory: `../membership-applications`), not as a finished product. `ROADMAP.md` tracks the in-progress production-readiness hardening
work (connection pooling, HTTP timeouts, rate limiting, graceful shutdown, etc.) one phase at a
time; pick up at whichever phase is still marked `[ ]`.

## Commands

Package manager is pnpm (pinned via `packageManager`/`devEngines` to `pnpm@12.3.4`). Use pnpm,
not npm/yarn.

```bash
pnpm install                      # install dependencies
pnpm dev                          # run the API with tsx watch (Node), restarting on changes
pnpm build                        # tsc -p tsconfig.build.json: src/ -> dist/
pnpm start                        # node --enable-source-maps dist/index.js (production entry point)
pnpm typecheck                    # tsc --noEmit (base tsconfig.json, also covers drizzle.config.ts)
pnpm exec biome check .           # lint (Biome, not ESLint/Prettier)
pnpm exec biome check --write .   # lint + auto-fix
pnpm exec biome format --write .  # format only
pnpm exec tsx src/lib/auth.ts     # run a TS file directly during development

pnpm drizzle-kit generate   # generate migrations
pnpm drizzle-kit migrate    # run migrations

pnpm dlx auth@latest generate # generate auth-migrations
pnpm dlx auth@latest create-admin --email admin@example.com --name "Admin" --role admin # create admin user
```

Node 24 (`.nvmrc`) is the only runtime, in dev and in prod. Don't use Bun. There is no real
`test` script yet (`package.json`'s `test` script is a placeholder that exits with an error).

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
  and `DATABASE_URL` are read via `config`; `.env` is gitignored and never committed. Only the
  `dev` script loads `.env` (Node's `--env-file-if-exists`, real env vars win); app code must
  never load it (no `dotenv`), so production config comes from real env vars only.
- **API/HTTP**: `src/index.ts` mounts `auth.handler` on a [Hono](https://hono.dev/) app at
  `/api/auth/*` (all methods) and a `GET /health` route (`src/routes/health.ts` — debounced DB
  check plus connection-pool stats), served with `@hono/node-server` on `PORT`
  (default 5000, independent of `BETTER_AUTH_URL`, which is the public URL). CORS is enabled app-wide via `hono/cors`. The underlying `http.Server` has
  `requestTimeout`/`headersTimeout`/`keepAliveTimeout` configured so a slow/stalled client can't
  hold a connection open indefinitely (see `REQUEST_TIMEOUT_MS` etc. in `.env.example`). Client IP
  for rate limiting is controlled by `TRUSTED_PROXIES` (comma-separated IPs/CIDRs of the load
  balancer/CDN; must be present in the environment but may be empty, validated at startup and
  passed to better-auth as `advanced.ipAddress.trustedProxies`). When empty, `src/index.ts` overwrites `X-Forwarded-For`
  with the real TCP peer address before better-auth's rate limiter sees it (otherwise a direct
  client could spoof that header to bypass rate limiting). When set, the request passes through and
  better-auth reads the header right to left, skipping trusted proxies, to find the real client —
  behind a proxy, leaving it empty puts every user in one shared bucket (a startup warning fires
  when it's empty under `NODE_ENV=production`).
- **Database**: Drizzle ORM against PostgreSQL, schema in `src/data/schemas/auth-schema.ts`.
  `src/data/database.ts` constructs the `pg.Pool` explicitly (rather than via drizzle's
  `connection` shorthand) so it can also export `pool` directly for health-check stats; pool
  size/timeouts are configurable via `DB_POOL_MAX`/`DB_IDLE_TIMEOUT_MS`/`DB_CONNECTION_TIMEOUT_MS`.
  Create users (including the first admin) through better-auth (the `auth` CLI's `create-admin`,
  or `auth.api`), never with raw inserts into its tables: the password hash lives in `account`,
  not `user`.
- **Module system**: ESM throughout (`"type": "module"` in `package.json`), TypeScript compiled
  with `module: nodenext` / `target: esnext`. `verbatimModuleSyntax` and `isolatedModules` are on,
  so use explicit `import type` for type-only imports. Relative imports use `.js` specifiers
  (`'./config.js'` for `config.ts`) because `tsc` emits them unchanged and Node resolves them
  against `dist/`.
- **Build**: `tsconfig.json` is the base config (editor + `typecheck`, includes
  `drizzle.config.ts`). `tsconfig.build.json` extends it with `rootDir: src` / `outDir: dist`, no
  declaration files, so the output is `dist/index.js`. Source maps are
  emitted and enabled at runtime with `--enable-source-maps`, so stack traces point at `.ts`
  lines. `tsc` never deletes stale files from `dist/`, so delete it after renaming or removing a
  source file.
- **TypeScript strictness**: `strict`, `noUncheckedIndexedAccess`, and
  `exactOptionalPropertyTypes` are all enabled — code must satisfy these, not just base `strict`.
- **Formatting/linting**: Biome only (`biome.json`: single quotes, 120-char line width). No
  ESLint/Prettier config exists — don't add one.
