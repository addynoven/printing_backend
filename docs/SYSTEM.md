# POMS Backend — System Documentation

**Print Operations Management System** — Node.js/Express/MongoDB backend for managing
print shop orders, staff tasks, inventory, billing, payments, and analytics.

---

## Table of Contents

1. [Architecture](#architecture)
2. [Module Map](#module-map)
3. [Order State Machine](#order-state-machine)
4. [RBAC (Roles & Permissions)](#rbac)
5. [Task Auto-Assignment](#task-auto-assignment)
6. [Inventory & Stock Ledger](#inventory--stock-ledger)
7. [Billing](#billing)
8. [Barcode / QR Scanning](#barcode--qr-scanning)
9. [Notifications](#notifications)
10. [Analytics](#analytics)
11. [Error Handling](#error-handling)
12. [Environment Variables](#environment-variables)
13. [Running & Testing](#running--testing)
14. [API Reference](#api-reference)

---

## Architecture

```
src/
├── app.ts                        # Express app — middleware, route mounting, swagger
├── server.ts                     # MongoDB connect + listen
├── config/
│   ├── env.ts                    # Zod-validated environment variables
│   └── permissions.ts            # RBAC matrix (ROLES + PERMISSIONS)
├── middleware/
│   ├── authenticate.ts           # JWT verification → req.user
│   ├── authorize.ts              # permit(resource, action) + scopeToOwn
│   ├── validate.ts               # Zod request body validation
│   └── errorHandler.ts           # Unified error → JSON response
├── utils/
│   ├── AppError.ts               # Typed HTTP errors
│   ├── asyncHandler.ts           # try/catch wrapper for route handlers
│   └── logger.ts                 # Winston structured logger
└── modules/
    ├── auth/                     # Login, JWT, /me
    ├── users/                    # Staff CRUD + availability toggle
    ├── orders/                   # Orders + state machine
    ├── tasks/                    # Production tasks + auto-assigner
    ├── payments/                 # Payment recording + refunds
    ├── billing/                  # Raw and GST bill generation
    ├── inventory/                # Materials + stock ledger
    ├── machines/                 # Equipment registry
    ├── notifications/            # Per-user in-app notifications
    ├── barcode/                  # QR generation + scan events
    └── analytics/                # Aggregated metrics

docs/
├── openapi.yaml                  # Complete OpenAPI 3.0 spec
└── SYSTEM.md                     # This file

tests/
├── setup.ts                      # MongoMemoryReplSet setup/teardown
├── helpers/mock-factory.ts       # Test data factories
├── integration/                  # Supertest against real in-memory DB
└── e2e/                          # Multi-step workflow tests
```

**Design principle:** Feature-oriented modules. Every module owns its model, service,
routes, and tests. No cross-cutting layers (`controllers/`, `services/` at top level).

---

## Module Map

| Module | Path prefix | Key operations |
|--------|------------|----------------|
| auth | `/api/v1/auth` | login, get-me |
| users | `/api/v1/users` | CRUD, availability toggle |
| orders | `/api/v1/orders` | CRUD, status transitions, timeline |
| tasks | `/api/v1/tasks` | list, status update, manual assign |
| payments | `/api/v1/payments` | create, list, refund |
| billing | `/api/v1/billing` | generate raw/GST bill, list |
| inventory | `/api/v1/inventory` | CRUD, restock, ledger, low-stock alerts |
| machines | `/api/v1/machines` | CRUD, status change |
| notifications | `/api/v1/notifications` | list, unread count, mark read |
| barcodes | `/api/v1/barcodes` | generate QR, list, scan event |
| analytics | `/api/v1/analytics` | overview, orders, revenue, tasks |

---

## Order State Machine

Every order follows a linear state machine enforced in `order.statemachine.ts`.

```
        ┌──────────────────────────────────┐
        │                                  ▼
draft ──┤──► confirmed ──► designing ──► in_production ──► finishing ──► completed ──► invoiced
        │       │              │
        └───────┴──────────────┴──► cancelled
```

### Valid transitions

| From | To (allowed) |
|------|-------------|
| draft | confirmed, cancelled |
| confirmed | designing, cancelled |
| designing | in_production, cancelled |
| in_production | finishing |
| finishing | completed |
| completed | invoiced |
| invoiced | *(terminal)* |
| cancelled | *(terminal)* |

### Automatic hooks

Side effects are fired **after** the order is saved, in order:

| Transition | Hook | Effect |
|------------|------|--------|
| → `confirmed` | `autoAssignTask` | Creates a task; finds the least-loaded available staff for the job type and assigns |
| → `completed` | `deductForOrder` | Deducts each BOM entry from material stock; writes DEDUCT ledger entries |
| → `completed` | `generateFinalBarcode` | Creates a `final` QR barcode |
| → `cancelled` | `reverseOrderDeductions` | Finds all DEDUCT ledger entries for the order; restores stock; writes REVERSAL entries |

Hooks run sequentially and failures propagate (the transition itself is already committed).

---

## RBAC

Permissions are declared in `src/config/permissions.ts` as a static matrix.

### Roles

```
super_admin        — full access to everything
admin              — operational management (no billing.create, no user.delete)
sub_admin          — read-only on most resources, can create/update orders+tasks
designer           — own tasks + order reads
*_staff (10 roles) — own tasks + read orders + read inventory
```

### Permission matrix

| Resource | super_admin | admin | sub_admin | designer | staff |
|----------|:-----------:|:-----:|:---------:|:--------:|:-----:|
| users | CRUD | CRU | R | — | — |
| orders | CRUD | CRU | CRU | R (own) | R (own) |
| tasks | CRUD | CRUD | CRU | CRU (own) | RU (own) |
| billing | CRUD | R | R | — | — |
| payments | CRUD | CRU | R | — | — |
| inventory | CRUD | CRU | R | R | R |
| machines | CRUD | CRU | R | — | — |
| analytics | R | R | — | — | — |

### `scopeToOwn`

Roles with `own: true` on a resource have their list queries automatically filtered
to their own records. Staff cannot see other users' tasks or orders — enforced in
`authorize.ts` via `req.scopeToOwn` and respected in each service's list function.

---

## Task Auto-Assignment

When an order is confirmed, `autoAssignTask(order)` in `task.assigner.ts` runs:

1. Looks up the staff role from `JOB_ROLE_MAP`:

   | Job type | Staff role |
   |----------|-----------|
   | flex_printing | flex_printing_staff |
   | screen_printing | screen_printing_staff |
   | design | designer |
   | laser_cut | laser_cut_staff |
   | offset | offset_staff |
   | acrylic | acrylic_printing_staff |
   | glass | glass_printing_staff |
   | binding | binder_staff |

2. Queries for staff with `{ role, isAvailable: true, isActive: true }`, sorted by
   `activeTaskCount: 1` (least loaded first).

3. If staff found → `Task.create({ status: 'assigned', assignedTo: staff._id })`
   and increments `User.activeTaskCount += 1` + sets `lastAssignedAt`.

4. If no staff available → `Task.create({ status: 'unassigned', assignedTo: null })`.

When a task reaches `done`, `updateTaskStatus` decrements the assigned staff's
`activeTaskCount -= 1`.

---

## Inventory & Stock Ledger

Every stock change is recorded in `StockLedger` for a full audit trail.

### Ledger entry types

| Type | When |
|------|------|
| `RESTOCK` | Manual restock via `POST /inventory/:id/restock` |
| `DEDUCT` | Order completed — BOM materials deducted atomically |
| `REVERSAL` | Order cancelled — DEDUCT entries reversed |
| `ADJUSTMENT` | Manual correction (future) |

### BOM (Bill of Materials)

Orders optionally carry a `bom[]` array (`materialId`, `name`, `unit`, `qty`).
When the order is marked `completed`, `deductForOrder` runs inside a MongoDB
session (single-node replica set) and deducts each material atomically. If any
material is missing the entire transaction is aborted.

### Low-stock alerts

`GET /inventory/alerts` returns all materials where `stock ≤ threshold`.
The `threshold` is set per-material and defaults to 0.

---

## Billing

Two bill types generated from order data:

### Raw bill (`type: raw`)

- Series number: `RAW-YYYY-NNN`
- `amount = order.rawCost`
- `isProtected: true` — intended to be password-gated at download time
- Line items derived from `order.items`

### GST bill (`type: gst`)

- Series number: `TAX-YYYY-NNN`
- `taxableAmount = order.taxableValue`
- CGST = SGST = 9% of taxableAmount
- `totalAmount = taxableAmount + cgst + sgst`
- `isProtected: false`

Series numbers are sequential per type and year (`countDocuments` + `padStart(3, '0')`).

---

## Barcode / QR Scanning

Each order can have multiple barcodes (typically `initial` + `final`).

- **Generate** (`POST /barcodes/generate`): creates a QR code whose data payload
  is the orderId string. Returns the barcode record including a base64 PNG data URL.

- **Auto-generated**: when an order transitions to `completed`, a `final` barcode
  is automatically created via the state machine hook.

- **Scan events** (`POST /barcodes/scan/:orderId`): records who scanned, what action,
  and optionally notes/IP. Used by scanning stations on the shop floor.

- **Scan lookup** (`GET /barcodes/scan/:orderId`): returns the full order document
  so the scanning station can display order details after a QR scan.

---

## Notifications

Notifications are per-user and currently created programmatically (e.g., task
assignment events). The API provides:

- `GET /notifications` — list all for the authenticated user
- `GET /notifications/unread-count` — fast unread count
- `PATCH /notifications/:id/read` — mark one read (ownership enforced: returns 404
  if the notification belongs to a different user)
- `PATCH /notifications/read-all` — bulk mark-all-read; returns 204

---

## Analytics

All analytics endpoints require `analytics.read` permission (admin / super_admin only).

| Endpoint | Query |
|----------|-------|
| `GET /analytics/overview` | `countDocuments` on orders, tasks, low-stock materials; `aggregate` completed payment total |
| `GET /analytics/orders` | `aggregate` orders grouped by status |
| `GET /analytics/revenue` | `aggregate` completed payments grouped by method; sum total |
| `GET /analytics/tasks` | `aggregate` tasks grouped by status with avg totalMinutes |

---

## Error Handling

All errors return `{ "error": "<message>" }`.

| Condition | Status |
|-----------|--------|
| Missing / invalid JWT | 401 |
| Valid JWT, insufficient role | 403 |
| Zod validation failure | 400 |
| Invalid state transition | 400 |
| Malformed MongoDB ObjectId | 400 |
| Resource not found | 404 |
| Duplicate unique field | 409 |
| Unhandled exception | 500 (logged, generic message returned) |

Error classes live in `src/utils/AppError.ts`:
`NotFoundError`, `BadRequestError`, `UnauthorizedError`, `ForbiddenError`,
`ConflictError`, `ValidationError`.

---

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `NODE_ENV` | — | `development` | `development` \| `production` \| `test` |
| `PORT` | — | `5000` | HTTP listen port |
| `MONGODB_URI` | ✓ | — | MongoDB connection string |
| `JWT_SECRET` | ✓ | — | Min 16 chars — signs all JWTs |
| `JWT_EXPIRES_IN` | — | `8h` | Token expiry (any `ms` string) |
| `RAW_BILL_PASSWORD` | ✓ | — | Password for protected raw bills |
| `SHOP_GSTIN` | — | `""` | GST registration number |
| `SHOP_NAME` | — | `""` | Shop name printed on GST bills |
| `AWS_ACCESS_KEY_ID` | — | `""` | S3 file uploads (future) |
| `AWS_SECRET_ACCESS_KEY` | — | `""` | S3 file uploads (future) |
| `AWS_REGION` | — | `ap-south-1` | S3 region |
| `AWS_S3_BUCKET` | — | `poms-files` | S3 bucket name |

Copy `.env.example` → `.env` and fill in the required values.

---

## Running & Testing

```bash
# Install
pnpm install

# Development (hot-reload)
pnpm dev

# Production build
pnpm build && pnpm start

# Unit tests (mocked models)
pnpm test:unit

# Integration tests (MongoMemoryReplSet)
pnpm test:integration

# E2E tests (multi-step workflows)
pnpm test:e2e

# All tests
pnpm test:all

# Interactive API docs (requires dev server running)
open http://localhost:5000/api/docs

# Raw OpenAPI spec
curl http://localhost:5000/api/openapi.yaml
```

### Test architecture

| Layer | Location | What it tests |
|-------|----------|--------------|
| Unit | `src/**/*.test.ts` | Service functions with all models mocked via `vi.mock()` |
| Integration | `tests/integration/*.test.ts` | Full HTTP stack (supertest) against `MongoMemoryReplSet` |
| E2E | `tests/e2e/*.e2e.ts` | Multi-step business workflows (order lifecycle, task workflow, etc.) |

**396 tests total** — 142 unit, 208 integration, 46 E2E.

---

## API Reference

Interactive docs are available at `GET /api/docs` when the server is running.

The raw OpenAPI 3.0 spec is at `docs/openapi.yaml` and also served at
`GET /api/openapi.yaml`.

### Quick reference — all endpoints

```
POST   /api/v1/auth/login
GET    /api/v1/auth/me

GET    /api/v1/users
POST   /api/v1/users
GET    /api/v1/users/:id
PATCH  /api/v1/users/:id
DELETE /api/v1/users/:id
PATCH  /api/v1/users/:id/availability

GET    /api/v1/orders
POST   /api/v1/orders
GET    /api/v1/orders/:id
PATCH  /api/v1/orders/:id
DELETE /api/v1/orders/:id
PATCH  /api/v1/orders/:id/status
GET    /api/v1/orders/:id/timeline

GET    /api/v1/tasks
GET    /api/v1/tasks/:id
PATCH  /api/v1/tasks/:id/status
PATCH  /api/v1/tasks/:id/assign

GET    /api/v1/payments
POST   /api/v1/payments
GET    /api/v1/payments/order/:orderId
PATCH  /api/v1/payments/:id/refund

POST   /api/v1/billing
GET    /api/v1/billing/order/:orderId
GET    /api/v1/billing/:id

GET    /api/v1/inventory/alerts
GET    /api/v1/inventory
POST   /api/v1/inventory
GET    /api/v1/inventory/:id
PATCH  /api/v1/inventory/:id
POST   /api/v1/inventory/:id/restock
GET    /api/v1/inventory/:id/ledger

GET    /api/v1/machines
POST   /api/v1/machines
PATCH  /api/v1/machines/:id
PATCH  /api/v1/machines/:id/status

GET    /api/v1/notifications
GET    /api/v1/notifications/unread-count
PATCH  /api/v1/notifications/read-all
PATCH  /api/v1/notifications/:id/read

POST   /api/v1/barcodes/generate
GET    /api/v1/barcodes/order/:orderId
GET    /api/v1/barcodes/scan/:orderId
POST   /api/v1/barcodes/scan/:orderId

GET    /api/v1/analytics/overview
GET    /api/v1/analytics/orders
GET    /api/v1/analytics/revenue
GET    /api/v1/analytics/tasks
```
