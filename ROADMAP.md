# Production-Readiness Roadmap

Working doc for hardening `auth-server` before/while deploying it as a Docker container.
We're going through this slowly, one topic at a time, so each phase below is written as a
learning step, not just a checklist. We will not do all of this in one sitting — pick up at
whichever phase we last finished.

**Context assumed:** deployed as a Docker container, designed to be able to grow in traffic
over time (so we lean towards configurable-with-good-defaults rather than hardcoded).

## How to use this doc

Each phase has:
- **What** — the concrete change.
- **Why** — the failure mode it prevents, in plain terms.
- **New concepts** — what you'll learn doing it (since this is your first Hono/Drizzle/Node project).
- **New env vars** — what gets added to `.env.example`.

Status markers: `[ ]` not started, `[~]` in progress, `[x]` done.

---

## Phase 1 — Health endpoint
`[x]`

**What:** Add a `GET /health` (or `/healthz`) route on the Hono app that returns 200 with
basic status info, and (once Phase 3 exists) checks the DB connection is alive.

**Why:** Docker's `HEALTHCHECK`, and any orchestrator/load balancer later, needs a cheap way
to ask "is this instance actually working?" Without it, Docker only knows the process is
*running*, not that it can actually serve requests (e.g. DB connection dead but process alive).

**New concepts:** Hono routing (`app.get(...)`), returning JSON with `c.json(...)`, why
health checks are usually split into "liveness" (is the process up) vs "readiness" (can it
serve traffic) in container land.

**New env vars:** none yet.

---

## Phase 2 — Centralized, validated env config
`[x]`

**What:** ~~Every file that needs an env var did its own `if (!process.env.X) throw ...`~~ —
done: consolidated into `src/lib/config.ts`, which reads `process.env` once, validates it with
a `zod` schema, and exports a typed `config` object. `src/lib/cors.ts` (the old home of the
`CORS_ORIGINS` parsing) was deleted since its logic moved in. Before we add a handful of *new*
env vars in the phases below (pool size, timeouts, rate limits — all numbers/booleans, not just
strings), this gives every future phase one consistent place to add validation.

**Why:** Two reasons. (1) Parsing `"30000"` into a number and getting it wrong is an easy,
silent bug — do it once, correctly, in one place. (2) You've got `strict` +
`noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` on in `tsconfig` — a typed config
object gets you compile-time safety everywhere else in the app instead of `process.env.FOO!`
sprinkled around.

**New concepts:** fail-fast startup validation, why `process.env` values are always
`string | undefined` in TS, using `zod` to validate env vars declaratively (one schema,
all errors reported together) instead of hand-rolled `if` checks.

**New env vars:** none new, but existing ones move into the new module.

---

## Phase 3 — Database connection pooling
`[ ]`

**What:** `src/data/database.ts` currently does `drizzle(process.env.DATABASE_URL!)` with
zero pool configuration — it's using node-postgres's default pool (default max 10 clients,
no idle timeout). Make pool size, idle timeout, and connection timeout configurable.

**Why:** This is the one that actually bites people as traffic grows. If concurrent requests
exceed the pool's max connections, requests queue silently waiting for a free client; if a
connection to Postgres goes stale (network blip, DB restart) with no idle/connection timeout,
the pool can hold dead connections and requests hang instead of failing fast.

**New concepts:** what a connection pool is and why you don't open a new DB connection per
request, how `pg.Pool` options map through Drizzle, the tradeoff between pool size and your
Postgres server's `max_connections`.

**New env vars:** `DB_POOL_MAX`, `DB_IDLE_TIMEOUT_MS`, `DB_CONNECTION_TIMEOUT_MS` (exact
names TBD when we get there).

---

## Phase 4 — HTTP server & request timeouts
`[ ]`

**What:** Configure timeouts on the underlying Node HTTP server that `@hono/node-server`
starts (`serve()` in `src/index.ts`) — things like `requestTimeout`, `headersTimeout`,
`keepAliveTimeout` — so a slow/stalled client can't hold a connection open forever.

**Why:** Without these, a client that connects but sends data slowly (or never finishes)
can tie up server resources indefinitely. This matters more once you're behind a reverse
proxy/load balancer too (`keepAliveTimeout` in particular needs to be tuned relative to the
proxy's own timeout to avoid race conditions on connection reuse).

**New concepts:** the difference between "the DB call is slow" (Phase 3 territory) and
"the HTTP connection itself is slow/stuck" (this phase), how Node's `http.Server` timeout
options interact with each other.

**New env vars:** `REQUEST_TIMEOUT_MS`, `KEEP_ALIVE_TIMEOUT_MS` (naming TBD).

---

## Phase 5 — Rate limiting
`[ ]`

**What:** better-auth actually ships built-in rate limiting (a `rateLimit` option on
`betterAuth(...)`) — we should look at that first before reaching for a separate Hono
middleware or external service. Decide what needs limiting beyond auth routes themselves
(there currently are none — everything goes through `/api/auth/*`).

**Why:** Auth endpoints (login, password reset, signup) are the classic brute-force/credential
-stuffing target. This is security, not just resilience.

**New concepts:** what better-auth's rate limiter does out of the box (in-memory vs a shared
store — matters once you run more than one container replica), fixed-window vs sliding-window
limiting.

**New env vars:** depends on what better-auth's config exposes — TBD.

---

## Phase 6 — Graceful shutdown
`[ ]`

**What:** Handle `SIGTERM` (what Docker sends on `docker stop`/redeploy) by stopping new
connections, letting in-flight requests finish, and closing the DB pool cleanly, before the
process exits.

**Why:** Without this, a redeploy or scale-down can cut off in-flight requests mid-response
and leave DB connections dangling until they time out on their own. This is where Phases 1, 3,
and 4 all tie together (health endpoint should start reporting "not ready" during shutdown too).

**New concepts:** Node process signals, why containers get a grace period before `SIGKILL`,
closing a `pg.Pool` cleanly.

**New env vars:** possibly `SHUTDOWN_GRACE_PERIOD_MS`.

---

## Phase 7 — Structured logging / request logging
`[ ]`

**What:** Replace the bare `console.log` calls in `src/index.ts` with structured request
logging (method, path, status, duration) and give it a log-level knob.

**Why:** Once the phases above exist, you need visibility to know if they're actually doing
anything — e.g. "are we hitting the pool limit," "is the rate limiter tripping," "did shutdown
drain in time." Logging is what makes the rest of this observable instead of theoretical.

**New concepts:** Hono middleware (`app.use(...)`), structured (JSON) logs vs plain text and
why it matters once logs go to a container log driver / aggregator.

**New env vars:** `LOG_LEVEL`.

---

## Later / stretch (not yet scheduled)

- **Node thread pool tuning (`UV_THREADPOOL_SIZE`)** — only worth touching if profiling
  under load shows password hashing (bcrypt/scrypt, used internally by better-auth) is
  bottlenecked on libuv's threadpool. Premature before Phase 3 exists to even generate load.
- **Docker `HEALTHCHECK` wiring** — once Phase 1 exists, wire it into the `Dockerfile`
  (there isn't one yet — that's its own small phase).
- **Secrets management** — plain env vars vs Docker secrets / a vault, for
  `BETTER_AUTH_SECRET` and `DATABASE_URL` specifically in production.

---

## Suggested order

1 → 2 → 3 → 4 → 5 → 6 → 7, with the Dockerfile/HEALTHCHECK stretch item slotted in
after Phase 1 whenever convenient. Reasoning: start with something small and visible to get
comfortable with Hono (1), then build the config foundation everything else will lean on (2)
*before* piling more env vars onto the ad-hoc pattern, then tackle infra concerns roughly in
order of "how likely/costly is this to bite us as traffic grows" (3–6), and finish with
logging (7) so you can actually observe all of the above.
