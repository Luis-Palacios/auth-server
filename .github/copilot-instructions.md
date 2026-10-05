# Copilot Instructions

## Project context

This is the standalone authentication microservice for the larger `members-management` project. It is a running Node 24 service, not a scaffold. Hono serves Better Auth and custom invite APIs backed by Drizzle/PostgreSQL; the sibling staff application consumes it through a same-origin `/api/auth/*` proxy.

Use pnpm only (pinned to `12.3.4`) and Node 24 (`.nvmrc`). Copy `.env.example` to `.env` for local development; only `pnpm dev` loads that file. Production receives real environment variables, and application code must not load `.env` or read `process.env` outside `src/lib/config.ts`. Never commit `.env` or secrets. `BETTER_AUTH_SECRET` must be high entropy and at least 32 characters (`openssl rand -base64 32`).

## Build, test, and lint

```bash
pnpm install
pnpm dev                          # watch src/index.ts, loading .env when present
pnpm build                        # compile src/ to dist/ with tsconfig.build.json
pnpm start                        # run dist/index.js with source maps
pnpm typecheck                    # tsc --noEmit, including drizzle.config.ts
pnpm exec biome check .           # lint and formatting checks
pnpm exec biome check --write .   # lint and apply fixes
pnpm exec biome format --write .  # format only
pnpm drizzle-kit generate         # generate migrations from the Drizzle schema
pnpm drizzle-kit migrate          # apply migrations
```

There is no test runner or single-test command yet: `pnpm test` intentionally exits with an error. Use `pnpm typecheck` and `pnpm exec biome check .` to validate changes. `tsc` does not remove stale `dist/` output, so delete affected generated files after renaming or removing source files.

## Architecture

- **Startup and HTTP:** `src/index.ts` creates the Hono app, mounts Better Auth at `/api/auth/*`, custom auth routes at `/api/custom-auth`, and `GET /health`. `@hono/node-server` binds to `PORT` on all interfaces and owns the configured request, headers, and keep-alive timeouts.
- **Configuration:** `src/lib/config.ts` validates every environment variable with Zod at startup and exports the typed `config` object. `BETTER_AUTH_URL` is the public client-facing URL; `PORT` is the listener port and may differ behind a proxy. `TRUSTED_ORIGINS` controls Better Auth CSRF/redirect trust, while `CORS_ORIGINS` controls browser CORS and mounts middleware only when non-empty.
- **Authentication and authorization:** `src/lib/auth.ts` exports the one shared `auth` instance. It uses the Drizzle adapter, email/password verification and reset emails through Resend, Better Auth `admin`, `jwt`, and `openAPI` plugins, plus `better-invite`. Role statements live in `src/permissions/statements.ts`; new sign-ups receive `pending`, so they have no permissions until assigned a role. JWTs intentionally contain only the user role in addition to Better Auth's subject.
- **Data and migrations:** `src/data/database.ts` creates the shared `pg.Pool` and Drizzle client. Better Auth tables and relations are in `src/data/schemas/auth-schema.ts`; generated migrations are committed under `drizzle/`. Create users through Better Auth (`auth.api` or `pnpm dlx auth@latest create-admin`), not direct SQL, because credentials live in `account`, not `user`.
- **Invite flow:** Better Auth's invite endpoints create/cancel invites with the `invites` permission. `src/routes/custom-auth/invites.ts` adds the read-only cross-inviter list endpoint, guarded by the same `invites:create` permission. Invite emails link to the staff app's `/accept-invite` page, which activates the token through its auth proxy rather than relying on an auth-server cookie across origins.
- **Operational behavior:** `/health` reports database readiness and pool pressure while debouncing the database query; it returns 503 during shutdown or DB failure. `src/lib/shutdown.ts` drains the HTTP server and pool on `SIGTERM`/`SIGINT`, bounded by `SHUTDOWN_TIMEOUT_MS`. The next uncompleted production-readiness task is tracked in `ROADMAP.md`.

## Codebase conventions

- Build auth changes around the exported `auth` instance; do not create another Better Auth instance.
- Add or change environment settings in `src/lib/config.ts`, `.env.example`, and their consuming configuration together. Preserve the validated relationships between HTTP timeout values.
- Treat `TRUSTED_PROXIES` as a security boundary. When it is empty, `resolveAuthRequest` overwrites `X-Forwarded-For` with the TCP peer IP to prevent rate-limit bypasses. Configure only known proxy IPs/CIDRs when deploying behind a proxy.
- Reuse `accessControl` roles and permission statements for custom endpoints. Do not duplicate role checks that can drift from the Better Auth admin/invite plugin policy.
- The service is ESM with `module: nodenext`: use `.js` extensions in relative TypeScript imports, and use explicit `import type` declarations for type-only imports. Code must satisfy `strict`, `noUncheckedIndexedAccess`, and `exactOptionalPropertyTypes`.
- Use Biome only for TypeScript formatting and linting. The repository uses single quotes and a 120-character line width; do not add ESLint or Prettier.
