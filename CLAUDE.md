# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project state

This is an early-stage scaffold, not a running service yet. `src/lib/auth.ts` currently just
instantiates `betterAuth({})` with an empty config, and `src/lib/data/` is empty. There is no
server entrypoint, no route handlers, and no database wired up yet — treat this as the
foundation of a standalone auth microservice within the larger `members-management` project
(sibling directory: `../membership-applications`), not as a finished product.

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
```

There is no real `test` script yet (`package.json`'s `test` script is a placeholder that exits
with an error) and no `build`/`dev`/`start` script defined — don't assume one exists.

## Architecture notes

- **Auth**: built on [`better-auth`](https://www.better-auth.com/), configured in
  `src/lib/auth.ts` via `betterAuth(...)`. `BETTER_AUTH_SECRET` (32+ chars, high entropy —
  `openssl rand -base64 32`) and `BETTER_AUTH_URL` are read from the environment (see
  `.env.example`); `.env` is gitignored and never committed.
- **Module system**: ESM throughout (`"type": "module"` in `package.json`), TypeScript compiled
  with `module: nodenext` / `target: esnext`. `verbatimModuleSyntax` and `isolatedModules` are on,
  so use explicit `import type` for type-only imports.
- **TypeScript strictness**: `strict`, `noUncheckedIndexedAccess`, and
  `exactOptionalPropertyTypes` are all enabled — code must satisfy these, not just base `strict`.
- **Formatting/linting**: Biome only (`biome.json`: single quotes, 120-char line width). No
  ESLint/Prettier config exists — don't add one.
