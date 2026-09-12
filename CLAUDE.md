# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project state

This is an early-stage but now-running service. `src/lib/auth.ts` configures `betterAuth(...)`
with a Drizzle/PostgreSQL adapter (`src/data/database.ts`, `src/data/schemas/auth-schema.ts`) and
the `admin`, `jwt`, and `openAPI` plugins. `src/index.ts` mounts the auth handler on a Hono app
(`/api/auth/*`) and serves it via `@hono/node-server`. Treat this as the foundation of a
standalone auth microservice within the larger `members-management` project (sibling directory:
`../membership-applications`), not as a finished product — there's still no `build`/`dev`/`start`
script, and the port is hardcoded rather than read from `BETTER_AUTH_URL`.

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

- **Auth**: built on [`better-auth`](https://www.better-auth.com/), configured in
  `src/lib/auth.ts` via `betterAuth(...)` with a Drizzle/PostgreSQL adapter and the `admin`,
  `jwt` (JWKS served at `/.well-known/jwks.json`), and `openAPI` plugins. `BETTER_AUTH_SECRET`
  (32+ chars, high entropy — `openssl rand -base64 32`), `BETTER_AUTH_URL`, and `DATABASE_URL`
  are read from the environment (see `.env.example`); `.env` is gitignored and never committed.
- **API/HTTP**: `src/index.ts` mounts `auth.handler` on a [Hono](https://hono.dev/) app at
  `/api/auth/*` (all methods) and serves it with `@hono/node-server` on port 5000 (hardcoded —
  not yet read from `BETTER_AUTH_URL`). CORS is enabled app-wide via `hono/cors`.
- **Database**: Drizzle ORM against PostgreSQL, schema in `src/data/schemas/auth-schema.ts`,
  connection in `src/data/database.ts`, seed script in `src/data/seed.ts` (run with `bun`, not
  Node/tsx).
- **Module system**: ESM throughout (`"type": "module"` in `package.json`), TypeScript compiled
  with `module: nodenext` / `target: esnext`. `verbatimModuleSyntax` and `isolatedModules` are on,
  so use explicit `import type` for type-only imports.
- **TypeScript strictness**: `strict`, `noUncheckedIndexedAccess`, and
  `exactOptionalPropertyTypes` are all enabled — code must satisfy these, not just base `strict`.
- **Formatting/linting**: Biome only (`biome.json`: single quotes, 120-char line width). No
  ESLint/Prettier config exists — don't add one.
