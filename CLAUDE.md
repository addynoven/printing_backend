# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm dev                  # Start dev server (tsx watch)
pnpm build                # Compile TypeScript to dist/
pnpm start                # Run compiled dist/app.js

pnpm test                 # All unit + integration tests (vitest run)
pnpm test:unit            # Unit tests only — src/**/*.test.ts
pnpm test:integration     # Integration tests — tests/integration/
pnpm test:e2e             # E2E tests — tests/e2e/**/*.e2e.ts
pnpm test:system          # System tests against real DB (uses .env, not .env.test)
pnpm test:watch           # Watch mode

# Run a single test file
pnpm vitest run src/modules/orders/order.statemachine.test.ts

pnpm seed:dev             # Seed default super_admin: admin@poms.dev / Admin@1234
pnpm seed <name> <email> <password>  # Seed custom super_admin
```

## Starting the DB

```bash
docker compose up -d   # start MongoDB on localhost:27017
docker compose down    # stop it
```

Data persists in the `poms_mongo_data` Docker volume.

## Dev Credentials

Default super_admin seeded by `pnpm seed:dev`:

```
Email:    admin@poms.dev
Password: Admin@1234
```

## Environment

Unit/integration/e2e tests load `.env.test`. System tests load `.env`. Required vars (validated by Zod at startup in [src/config/env.ts](src/config/env.ts)):

- `MONGODB_URI` — required
- `JWT_SECRET` — required, min 16 chars
- `RAW_BILL_PASSWORD` — required (protects raw bill PDF download)
- `PORT` — default 5000

## Architecture

**Print Operations Management System (POMS)** — Express + MongoDB (Mongoose) + JWT auth. All routes are prefixed `/api/v1/`. Swagger docs served at `/api/docs` from `docs/openapi.yaml`.

### Module Layout

Every feature lives in `src/modules/<name>/` with these files:

```
<name>.routes.ts    # Express router — auth/RBAC middleware applied here
<name>.service.ts   # Business logic, throws typed AppErrors
<name>.model.ts     # Mongoose schema + TypeScript interfaces
<name>.test.ts      # Co-located unit tests (mock the Mongoose model)
```

Some modules have additional domain files: `order.statemachine.ts`, `task.assigner.ts`.

### Modules

| Module | Key concepts |
|---|---|
| `auth` | JWT login, `GET /me` |
| `users` | CRUD, soft-delete (`isActive`), availability toggle |
| `machines` | Print machine registry |
| `orders` | Order lifecycle via state machine (see below) |
| `inventory` | Material stock, deducted on order completion |
| `tasks` | Auto-assigned to staff on order confirmation |
| `billing` | Bill generation per order |
| `payments` | Payment records against bills |
| `notifications` | In-app notifications |
| `barcode` | QR/barcode generation (S3-backed), triggered on order transitions |
| `analytics` | Reporting aggregations |

### Order State Machine ([src/modules/orders/order.statemachine.ts](src/modules/orders/order.statemachine.ts))

```
draft → confirmed → designing → in_production → finishing → completed → invoiced
  ↓          ↓           ↓
cancelled  cancelled  cancelled
```

Side-effect hooks fire on transitions: `confirmed` auto-assigns tasks, `completed` deducts inventory + generates final barcode, `cancelled` reverses inventory deductions.

### Shared Infrastructure

- **Error classes** ([src/utils/AppError.ts](src/utils/AppError.ts)): `NotFoundError`, `BadRequestError`, `UnauthorizedError`, `ForbiddenError`, `ConflictError` — all extend `AppError`. Throw these from services; `errorHandler` middleware maps them to HTTP responses.
- **Middleware** ([src/middleware/](src/middleware/)): `authenticate` (JWT), `permit(...roles)` (RBAC), `validate(schema)` (Zod), `errorHandler`.
- **`asyncHandler`**: wraps async route handlers to forward errors to Express.
- **Logger**: Winston, structured JSON in production.
- **Env**: Zod-validated at startup — server will not start with invalid config.

### Testing Layers

Three distinct layers, each with their own setup:

1. **Unit** (`src/**/*.test.ts`) — Mongoose model is mocked via `vi.spyOn`. Uses `tests/setup.ts` with `MongoMemoryReplSet`.
2. **Integration** (`tests/integration/*.test.ts`) — Uses `supertest` against the real Express `app`. Same in-memory MongoDB.
3. **E2E** (`tests/e2e/**/*.e2e.ts`) — Full flow tests, same in-memory setup but longer timeouts.
4. **System** (`tests/system/`) — Hits a real MongoDB from `.env`. No shared setup file, runs in single-fork mode.

`tests/helpers/mock-factory.ts` provides `makeUser()`, `makeOrder()`, `makeTask()` for seeding test data.

---

## MCP Tools: code-review-graph

**IMPORTANT: This project has a knowledge graph. ALWAYS use the
code-review-graph MCP tools BEFORE using Grep/Glob/Read to explore
the codebase.** The graph is faster, cheaper (fewer tokens), and gives
you structural context (callers, dependents, test coverage) that file
scanning cannot.

### When to use graph tools FIRST

- **Exploring code**: `semantic_search_nodes` or `query_graph` instead of Grep
- **Understanding impact**: `get_impact_radius` instead of manually tracing imports
- **Code review**: `detect_changes` + `get_review_context` instead of reading entire files
- **Finding relationships**: `query_graph` with callers_of/callees_of/imports_of/tests_for
- **Architecture questions**: `get_architecture_overview` + `list_communities`

Fall back to Grep/Glob/Read **only** when the graph doesn't cover what you need.

### Key Tools

| Tool | Use when |
|------|----------|
| `detect_changes` | Reviewing code changes — gives risk-scored analysis |
| `get_review_context` | Need source snippets for review — token-efficient |
| `get_impact_radius` | Understanding blast radius of a change |
| `get_affected_flows` | Finding which execution paths are impacted |
| `query_graph` | Tracing callers, callees, imports, tests, dependencies |
| `semantic_search_nodes` | Finding functions/classes by name or keyword |
| `get_architecture_overview` | Understanding high-level codebase structure |
| `refactor_tool` | Planning renames, finding dead code |

### Workflow

1. The graph auto-updates on file changes (via hooks).
2. Use `detect_changes` for code review.
3. Use `get_affected_flows` to understand impact.
4. Use `query_graph` pattern="tests_for" to check coverage.
