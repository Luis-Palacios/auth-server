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
pnpm drizzle-kit migrate    # run migrations (local dev)
node dist/migrate.js        # run migrations in the production image (one-off task; see below)

docker build -t auth-server:dev .                                  # build the production image
docker run --rm -e DATABASE_URL=... auth-server:dev node dist/migrate.js  # migrate from the image

pnpm dlx auth@latest generate # generate auth-migrations

# give a signed-up, verified user a role (e.g. the first admin); see "One-off scripts" below
pnpm exec tsx --env-file-if-exists=.env src/scripts/set-role.ts <email> <role>  # local dev
node dist/scripts/set-role.js <email> <role>                                    # production image
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
  (default 5000, independent of `BETTER_AUTH_URL`, which is the public URL). Origins are two separate settings: `TRUSTED_ORIGINS` feeds better-auth's
  `trustedOrigins` (CSRF and redirect checks; `BETTER_AUTH_URL`'s origin is always trusted, so it's
  empty in prod), and `CORS_ORIGINS` mounts `hono/cors` only when non-empty (no browser calls this
  service cross-origin: staff-app proxies `/api/auth/*` same-origin). The underlying `http.Server` has
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
- **Shutdown**: `src/lib/shutdown.ts` handles `SIGTERM`/`SIGINT`: `server.close()`, then
  `pool.end()`, bounded by `SHUTDOWN_TIMEOUT_MS`. While shutting down, a middleware in
  `src/index.ts` adds `Connection: close` to every response (otherwise busy keep-alive sockets hold
  `server.close()` open for `KEEP_ALIVE_TIMEOUT_MS`) and `/health` returns 503. Anything else that
  holds a resource (new pools, clients, timers) must be closed there too.
- **Database**: Drizzle ORM against PostgreSQL, schema in `src/data/schemas/auth-schema.ts`.
  `src/data/database.ts` constructs the `pg.Pool` explicitly (rather than via drizzle's
  `connection` shorthand) so it can also export `pool` directly for health-check stats; pool
  size/timeouts are configurable via `DB_POOL_MAX`/`DB_IDLE_TIMEOUT_MS`/`DB_CONNECTION_TIMEOUT_MS`.
  Create users through better-auth (sign-up, invites, or `auth.api`), never with raw inserts into
  its tables: the password hash lives in `account`, not `user`. Changing an existing user's role is
  the one exception (see "One-off scripts").
- **Migrations in production**: `src/migrate.ts` → `dist/migrate.js`, shipped in the same image and
  run as a one-off task before each deploy, never on app startup. It calls drizzle-orm's
  `migrate()`, which is the same code `drizzle-kit migrate` uses (verified: same
  `drizzle.__drizzle_migrations` table and hashes), so upgrade `drizzle-orm` and `drizzle-kit`
  together. Constraints to keep:
  - It must **not** import `lib/config.ts` or `data/database.ts`: the migrate task gets only
    `DATABASE_URL`, none of the app's secrets.
  - Lock, `lock_timeout` and the migrations all run on **one `pg.Client`**. A pool would break the
    advisory lock, which belongs to a session.
  - `pg_advisory_lock` must be taken **before** `SET lock_timeout`, because `lock_timeout` also
    applies to advisory locks and would make a second run fail instead of wait.
  - All pending migrations run in one transaction, so `CREATE INDEX CONCURRENTLY` needs separate
    handling.
- **One-off scripts**: `src/scripts/set-role.ts` → `dist/scripts/set-role.js <email> <role>`, run as
  a one-off task from the app's own task definition (DML only, so the app's DB user is enough). The
  first admin signs up normally in staff-app (role `pending`), then this promotes them; it's also
  the break-glass fix if every admin loses access. Constraints to keep:
  - Like `migrate.ts`, it must **not** import `lib/config.ts`, `lib/auth.ts` or `data/database.ts`:
    it needs only `DATABASE_URL`, so it still works when the app's config is broken. Valid roles
    come from `roles` in `permissions/statements.ts`, the same map the admin plugin uses.
  - It updates `user.role` directly, so better-auth's `databaseHooks` don't run (none are
    configured). Revisit the script if a user-update hook is ever added.
  - It refuses unverified accounts and doesn't revoke sessions (to lock out a compromised account,
    ban it). The new role is visible on the user's next request only while `session.cookieCache`
    stays off.
  - Exit codes: `0` changed or already set, `1` failure at run time (not found, unverified, DB
    error), `2` usage error.
- **Docker image**: multi-stage `Dockerfile` (Alpine, Node and Alpine pinned exactly, non-root
  `node` user, exec-form `CMD` so node is PID 1 and gets SIGTERM). `.pnpmfile.cjs` drops
  better-auth's optional `drizzle-kit` peer, so `--prod` installs don't ship drizzle-kit/esbuild.
  The lockfile records its checksum, so the Dockerfile has to bind-mount it in both install steps.
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
