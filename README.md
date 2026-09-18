# auth-server

Standalone authentication service for the `members-management` project, built on
[Better Auth](https://www.better-auth.com/).

## Status

Early-stage but running: a Hono app mounts the Better Auth handler at `/api/auth/*` and a
`/health` route, backed by a Drizzle/PostgreSQL database, with the `admin`, `jwt`, and `openAPI`
(interactive docs) plugins plus built-in rate limiting enabled. No `build`, `dev`, `start`, or
`test` scripts yet. See [`ROADMAP.md`](./ROADMAP.md) for the in-progress production-readiness
hardening work (connection pooling, HTTP timeouts, rate limiting, etc.).

## Prerequisites

- [Node.js 24](https://nodejs.org/en/download) — the required JavaScript runtime (version is pinned in `.nvmrc`).
- [pnpm 12.3.4](https://pnpm.io/installation) — the required package manager.
- [Bun](https://bun.sh/docs/installation) — used to run the database seed script.
- [PostgreSQL](https://www.postgresql.org/download/) — required by the configured Drizzle/PostgreSQL database layer. You can
  install it locally or run it in [Docker](https://docs.docker.com/get-started/get-docker/); set its connection string as
  `DATABASE_URL` in `.env`.

## Tech stack

- **TypeScript** — strict mode, ESM (`nodenext`)
- **Better Auth** — authentication, with the `admin`, `jwt`, `openAPI` plugins and built-in rate limiting enabled
- **Hono** — API mount handler, served via `@hono/node-server`
- **Drizzle ORM** — PostgreSQL database layer
- **Zod** — environment variable validation (`src/lib/config.ts`)
- **Biome** — linting and formatting
- **pnpm** — package manager

## Getting started

```bash
pnpm install
```

Copy `.env.example` to `.env` and fill in the values:

```bash
cp .env.example .env
```

- `BETTER_AUTH_SECRET` — at least 32 characters, high entropy. Generate one with:

  ```bash
  openssl rand -base64 32
  ```

- `BETTER_AUTH_URL` — the URL this service will run on (defaults to `http://localhost:5000`)

## Scripts

```bash
pnpm exec biome check .           # lint
pnpm exec biome check --write .   # lint + auto-fix
pnpm exec biome format --write .  # format only
pnpm exec tsc --noEmit            # type-check
pnpm exec tsx src/lib/auth.ts     # run a TS file directly during development

pnpm dlx auth@latest generate # generate better-auth schemas
## Move auth-schemas to ./src/data/schemas then:
pnpm drizzle-kit generate   # generate migrations
pnpm drizzle-kit migrate # run migrations



pnpm dlx auth@latest create-admin --email admin@example.com --name "Admin" --role admin # create admin user, password will be asked

bun ./src/data/seed.ts # seed database
bun ./src/index.ts     # run the Hono API
```

No `build`, `dev`, `start`, or `test` scripts are defined yet.

## API

Running `bun ./src/index.ts` starts a Hono server (port derived from `BETTER_AUTH_URL`, default
`5000`) with all Better Auth routes mounted under `/api/auth/*`. Notable endpoints:

- `/api/auth/*` — Better Auth's own routes (sign-up, sign-in, sessions, admin endpoints, etc.)
- `/api/auth/.well-known/jwks.json` — JWKS endpoint from the `jwt` plugin
- `/api/auth/reference` — interactive OpenAPI docs from the `openAPI` plugin
- `/health` — liveness/readiness check: runs a debounced query through the DB pool and reports
  `db: 'up'|'down'` (503 on failure) plus pool stats; intended for Docker's `HEALTHCHECK` and any
  future load balancer/orchestrator
