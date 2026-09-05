# Copilot Instructions

## Project context

This repository is the standalone authentication microservice for the larger `members-management` project. It is an early-stage scaffold: `src/lib/auth.ts` exports the shared Better Auth instance, while server startup, HTTP routes, persistence, and `src/lib/data/` implementations have not been added yet. Build new auth configuration around the exported `auth` instance rather than creating competing Better Auth instances.

Better Auth configuration depends on:

- `BETTER_AUTH_SECRET`: a high-entropy secret of at least 32 characters. Generate one with `openssl rand -base64 32`.
- `BETTER_AUTH_URL`: service URL, defaulting to `http://localhost:5000` in `.env.example`.

Copy `.env.example` to `.env` for local development. Never commit `.env` or secrets.

## Commands

Use pnpm only; the repository pins `pnpm@12.3.4`.

```bash
pnpm install
pnpm exec biome check .           # lint and formatting checks
pnpm exec biome check --write .   # lint and formatting auto-fix
pnpm exec biome format --write .  # formatting only
pnpm exec tsc --noEmit            # type-check
pnpm exec tsx src/lib/auth.ts     # run a TypeScript module directly
```

There is currently no usable test runner or single-test command: `pnpm test` is a placeholder that exits with an error. No `build`, `dev`, or `start` scripts exist yet.

## TypeScript and formatting conventions

- The project is ESM (`"type": "module"`) with `module: "nodenext"`. Keep import/export syntax ESM-compatible.
- `verbatimModuleSyntax` and `isolatedModules` are enabled. Write explicit `import type` declarations for type-only imports.
- TypeScript must satisfy `strict`, `noUncheckedIndexedAccess`, and `exactOptionalPropertyTypes`; handle potentially absent indexed values and do not provide `undefined` for optional properties unless their type explicitly permits it.
- Use Biome only for linting and formatting. Its JavaScript/TypeScript style uses single quotes and a 120-character line width; do not add ESLint or Prettier configuration.
