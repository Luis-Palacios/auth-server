# auth-server

Standalone authentication service for the `members-management` project, built on
[Better Auth](https://www.better-auth.com/).

## Status

Early-stage but running: a Hono app mounts the Better Auth handler at `/api/auth/*`, backed by
a Drizzle/PostgreSQL database, with the `admin`, `jwt`, and `openAPI` (interactive docs) plugins
enabled. No `build`, `dev`, `start`, or `test` scripts yet, and the port is hardcoded rather than
read from `BETTER_AUTH_URL`.

## Prerequisites

- [Node.js 24](https://nodejs.org/en/download) — the required JavaScript runtime (version is pinned in `.nvmrc`).
- [pnpm 12.3.4](https://pnpm.io/installation) — the required package manager.
- [Bun](https://bun.sh/docs/installation) — used to run the database seed script.
- [PostgreSQL](https://www.postgresql.org/download/) — required by the configured Drizzle/PostgreSQL database layer. You can
  install it locally or run it in [Docker](https://docs.docker.com/get-started/get-docker/); set its connection string as
  `DATABASE_URL` in `.env`.

## Tech stack

- **TypeScript** — strict mode, ESM (`nodenext`)
- **Better Auth** — authentication, with the `admin`, `jwt`, and `openAPI` plugins enabled
- **Hono** — API mount handler, served via `@hono/node-server`
- **Drizzle ORM** — PostgreSQL database layer
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

pnpm drizzle-kit generate   # generate migrations
pnpm drizzle-kit migrate # run migrations

pnpm dlx auth@latest generate # generate auth-migrations

pnpm dlx auth@latest create-admin --email admin@example.com --name "Admin" --role admin # create admin user, password will be asked

bun .\src\data\seed.ts # seed database
bun .\src\index.ts # run the hono api
```

No `build`, `dev`, `start`, or `test` scripts are defined yet.

## API

Running `bun .\src\index.ts` starts a Hono server (port 5000) with all Better Auth routes
mounted under `/api/auth/*`. Notable endpoints:

- `/api/auth/*` — Better Auth's own routes (sign-up, sign-in, sessions, admin endpoints, etc.)
- `/api/auth/.well-known/jwks.json` — JWKS endpoint from the `jwt` plugin
- `/api/auth/reference` — interactive OpenAPI docs from the `openAPI` plugin
