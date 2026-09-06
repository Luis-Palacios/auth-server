# auth-server

Standalone authentication service for the `members-management` project, built on
[Better Auth](https://www.better-auth.com/).

## Status

Early-stage scaffold — no server entrypoint, database, or routes wired up yet.

## Prerequisites

- [Node.js 24](https://nodejs.org/en/download) — the required JavaScript runtime (version is pinned in `.nvmrc`).
- [pnpm 12.3.4](https://pnpm.io/installation) — the required package manager.
- [Bun](https://bun.sh/docs/installation) — used to run the database seed script.
- [PostgreSQL](https://www.postgresql.org/download/) — required by the configured Drizzle/PostgreSQL database layer. You can
  install it locally or run it in [Docker](https://docs.docker.com/get-started/get-docker/); set its connection string as
  `DATABASE_URL` in `.env`.

## Tech stack

- **TypeScript** — strict mode, ESM (`nodenext`)
- **Better Auth** — authentication
- **Biome** — linting and formatting
- **pnpm** — package manager

### Planned

- **Drizzle** — ORM / database layer
- **Better Auth UI** — pre-built auth UI components

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

bun .\src\data\seed.ts # seed database
```

No `build`, `dev`, `start`, or `test` scripts are defined yet.
