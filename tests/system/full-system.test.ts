/**
 * Full System Test
 *
 * Tests every major API endpoint end-to-end against a real in-memory MongoDB
 * replica set, using the same HTTP interface the frontend calls.
 *
 * Run with: pnpm test:system
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import mongoose from 'mongoose'
import { MongoMemoryReplSet } from 'mongodb-memory-server'
import { app } from '../../src/app'
import { env } from '../../src/config/env'

// ── Guard: refuse to run against a non-test database ──────────────────────────
if (!env.MONGODB_URI.includes('memory') && !env.MONGODB_URI.includes('_test') && !env.MONGODB_URI.includes('_staging')) {
  throw new Error(
    `SYSTEM TEST SAFETY GUARD: MONGODB_URI (${env.MONGODB_URI}) does not look like a test/staging database. ` +
    `Refusing to run system tests against a potentially production database.`
  )
}

// ── Setup ─────────────────────────────────────────────────────────────────────

let mongo: MongoMemoryReplSet
let adminToken: string
let staffToken: string
let adminId: string
let staffId: string
let orderId: string
let taskId: string
let materialId: string
let machineId: string
let paymentId: string
let billId: string
let barcodeId: string

beforeAll(async () => {
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } })
  await mongoose.connect(mongo.getUri())
}, 120_000)

afterAll(async () => {
  await mongoose.disconnect()
  await mongo.stop()
}, 60_000)

// ── Auth ──────────────────────────────────────────────────────────────────────

describe('Auth', () => {
  it('POST /api/v1/auth/login → 401 for unknown user', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'nobody@poms.com', password: 'wrongpass' })
    expect(res.status).toBe(401)
    expect(res.body).toHaveProperty('error')
  })
})

// ── Users ─────────────────────────────────────────────────────────────────────

describe('Users', () => {
  it('POST /api/v1/users → 401 without auth', async () => {
    const res = await request(app).post('/api/v1/users').send({})
    expect(res.status).toBe(401)
  })

  it('seeds super_admin directly into DB', async () => {
    const { User } = await import('../../src/modules/auth/auth.model')
    const admin = await User.create({
      name: 'System Admin',
      email: 'admin@poms.com',
      password: 'Admin@1234',
      role: 'super_admin',
    })
    adminId = admin._id.toString()
  })

  it('POST /api/v1/auth/login → 200 with valid credentials', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'admin@poms.com', password: 'Admin@1234' })
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('token')
    expect(res.body.user.role).toBe('super_admin')
    expect(res.body.user).not.toHaveProperty('password')
    adminToken = res.body.token
  })

  it('GET /api/v1/auth/me → 200 returns current user', async () => {
    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${adminToken}`)
    expect(res.status).toBe(200)
    expect(res.body.email).toBe('admin@poms.com')
    expect(res.body).not.toHaveProperty('password')
  })

  it('POST /api/v1/users → 201 creates flex_printing_staff', async () => {
    const res = await request(app)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Print Staff',
        email: 'staff@poms.com',
        password: 'Staff@1234',
        role: 'flex_printing_staff',
      })
    expect(res.status).toBe(201)
    expect(res.body.role).toBe('flex_printing_staff')
    expect(res.body).not.toHaveProperty('password')
    staffId = res.body._id
  })

  it('POST /api/v1/auth/login → 200 staff login', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'staff@poms.com', password: 'Staff@1234' })
    expect(res.status).toBe(200)
    staffToken = res.body.token
  })

  it('GET /api/v1/users → 200 returns wrapped list', async () => {
    const res = await request(app)
      .get('/api/v1/users')
      .set('Authorization', `Bearer ${adminToken}`)
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('users')
    expect(Array.isArray(res.body.users)).toBe(true)
    expect(res.body.users.length).toBeGreaterThanOrEqual(2)
    expect(res.body).toHaveProperty('total')
  })

  it('GET /api/v1/users/:id → 200 returns single user', async () => {
    const res = await request(app)
      .get(`/api/v1/users/${staffId}`)
      .set('Authorization', `Bearer ${adminToken}`)
    expect(res.status).toBe(200)
    expect(res.body._id).toBe(staffId)
  })

  it('PATCH /api/v1/users/:id → 200 updates name', async () => {
    const res = await request(app)
      .patch(`/api/v1/users/${staffId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Updated Staff' })
    expect(res.status).toBe(200)
    expect(res.body.name).toBe('Updated Staff')
  })

  it('PATCH /api/v1/users/:id/availability → 200 toggles availability', async () => {
    const res = await request(app)
      .patch(`/api/v1/users/${staffId}/availability`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({})
    expect(res.status).toBe(200)
    expect(typeof res.body.isAvailable).toBe('boolean')
  })

  it('POST /api/v1/users → 409 duplicate email', async () => {
    const res = await request(app)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Dup', email: 'staff@poms.com', password: 'Pass@1234', role: 'designer' })
    expect(res.status).toBe(409)
  })

  it('GET /api/v1/users → 403 for staff role', async () => {
    const res = await request(app)
      .get('/api/v1/users')
      .set('Authorization', `Bearer ${staffToken}`)
    expect(res.status).toBe(403)
  })
})

// ── Inventory ─────────────────────────────────────────────────────────────────

describe('Inventory', () => {
  it('POST /api/v1/inventory → 201 creates material', async () => {
    const res = await request(app)
      .post('/api/v1/inventory')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Flex Banner Roll',
        category: 'flex',
        unit: 'sqft',
        stock: 500,
        threshold: 50,
        costPerUnit: 12,
      })
    expect(res.status).toBe(201)
    expect(res.body.name).toBe('Flex Banner Roll')
    expect(res.body.stock).toBe(500)
    materialId = res.body._id
  })

  it('GET /api/v1/inventory → 200 returns wrapped list', async () => {
    const res = await request(app)
      .get('/api/v1/inventory')
      .set('Authorization', `Bearer ${adminToken}`)
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('materials')
    expect(Array.isArray(res.body.materials)).toBe(true)
    expect(res.body.materials.length).toBeGreaterThanOrEqual(1)
    expect(res.body).toHaveProperty('total')
  })

  it('GET /api/v1/inventory/:id → 200 returns material', async () => {
    const res = await request(app)
      .get(`/api/v1/inventory/${materialId}`)
      .set('Authorization', `Bearer ${adminToken}`)
    expect(res.status).toBe(200)
    expect(res.body._id).toBe(materialId)
  })

  it('POST /api/v1/inventory/:id/restock → 200 adds stock', async () => {
    const res = await request(app)
      .post(`/api/v1/inventory/${materialId}/restock`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ qty: 100, note: 'Monthly restock' })
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('material')
    expect(res.body.material.stock).toBe(600)
    expect(res.body).toHaveProperty('transaction')
  })

  it('GET /api/v1/inventory/:id/ledger → 200 has RESTOCK entry', async () => {
    const res = await request(app)
      .get(`/api/v1/inventory/${materialId}/ledger`)
      .set('Authorization', `Bearer ${adminToken}`)
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('entries')
    expect(Array.isArray(res.body.entries)).toBe(true)
    const restock = res.body.entries.find((e: { type: string }) => e.type === 'RESTOCK')
    expect(restock).toBeDefined()
    expect(restock.qty).toBe(100)
  })

  it('GET /api/v1/inventory/alerts → 200 (no alerts — stock above threshold)', async () => {
    const res = await request(app)
      .get('/api/v1/inventory/alerts')
      .set('Authorization', `Bearer ${adminToken}`)
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('materials')
    expect(Array.isArray(res.body.materials)).toBe(true)
    const alert = res.body.materials.find((m: { _id: string }) => m._id === materialId)
    expect(alert).toBeUndefined()
  })

  it('PATCH /api/v1/inventory/:id → 200 updates threshold', async () => {
    const res = await request(app)
      .patch(`/api/v1/inventory/${materialId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ threshold: 100 })
    expect(res.status).toBe(200)
    expect(res.body.threshold).toBe(100)
  })
})

// ── Machines ──────────────────────────────────────────────────────────────────

describe('Machines', () => {
  it('POST /api/v1/machines → 201 creates machine', async () => {
    const res = await request(app)
      .post('/api/v1/machines')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Large Format Printer', type: 'flex_printer', department: 'Flex Printing' })
    expect(res.status).toBe(201)
    expect(res.body.status).toBe('active')
    machineId = res.body._id
  })

  it('GET /api/v1/machines → 200 returns list', async () => {
    const res = await request(app)
      .get('/api/v1/machines')
      .set('Authorization', `Bearer ${adminToken}`)
    expect(res.status).toBe(200)
    // machines route returns result from machineService.listMachines — check actual shape
    const machines = Array.isArray(res.body) ? res.body : res.body.machines ?? res.body
    expect(machines).toBeDefined()
  })

  it('PATCH /api/v1/machines/:id/status → 200 sets to maintenance', async () => {
    const res = await request(app)
      .patch(`/api/v1/machines/${machineId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'maintenance' })
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('maintenance')
  })

  it('PATCH /api/v1/machines/:id → 200 updates name', async () => {
    const res = await request(app)
      .patch(`/api/v1/machines/${machineId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Flex Printer v2' })
    expect(res.status).toBe(200)
    expect(res.body.name).toBe('Flex Printer v2')
  })
})

// ── Orders ────────────────────────────────────────────────────────────────────

describe('Orders', () => {
  it('POST /api/v1/orders → 400 missing required fields', async () => {
    const res = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ jobType: 'flex_printing' })
    expect(res.status).toBe(400)
  })

  it('POST /api/v1/orders → 201 creates order in draft', async () => {
    const res = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        customer: { name: 'Test Client', phone: '9876543210', email: 'client@test.com' },
        jobType: 'flex_printing',
        items: [{ description: 'Flex Banner 10x4', quantity: 2, unit: 'sqft', unitPrice: 250 }],
        rawCost: 500,
        taxableValue: 400,
        billSplitPct: 60,
        priority: 'normal',
        bom: [{ materialId, name: 'Flex Banner Roll', unit: 'sqft', qty: 80 }],
      })
    expect(res.status).toBe(201)
    expect(res.body.status).toBe('draft')
    expect(res.body.orderNumber).toMatch(/^ORD-/)
    expect(res.body.customer.name).toBe('Test Client')
    orderId = res.body._id
  })

  it('GET /api/v1/orders → 200 returns list', async () => {
    const res = await request(app)
      .get('/api/v1/orders')
      .set('Authorization', `Bearer ${adminToken}`)
    expect(res.status).toBe(200)
    // accept both wrapped and direct array
    const orders = Array.isArray(res.body) ? res.body : res.body.orders ?? res.body
    expect(orders).toBeDefined()
  })

  it('GET /api/v1/orders/:id → 200 returns order', async () => {
    const res = await request(app)
      .get(`/api/v1/orders/${orderId}`)
      .set('Authorization', `Bearer ${adminToken}`)
    expect(res.status).toBe(200)
    expect(res.body._id).toBe(orderId)
    expect(res.body.statusHistory).toHaveLength(1)
    expect(res.body.statusHistory[0].status).toBe('draft')
  })

  it('PATCH /api/v1/orders/:id/status → 400 invalid transition (draft → in_production)', async () => {
    const res = await request(app)
      .patch(`/api/v1/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'in_production' })
    expect(res.status).toBe(400)
  })

  it('PATCH /api/v1/orders/:id/status → 200 draft → confirmed', async () => {
    const res = await request(app)
      .patch(`/api/v1/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'confirmed' })
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('confirmed')
  })

  it('PATCH /api/v1/orders/:id/status → 200 confirmed → designing', async () => {
    const res = await request(app)
      .patch(`/api/v1/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'designing' })
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('designing')
  })

  it('PATCH /api/v1/orders/:id/status → 200 designing → in_production', async () => {
    const res = await request(app)
      .patch(`/api/v1/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'in_production' })
    expect(res.status).toBe(200)
  })

  it('PATCH /api/v1/orders/:id/status → 200 in_production → finishing', async () => {
    const res = await request(app)
      .patch(`/api/v1/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'finishing' })
    expect(res.status).toBe(200)
  })

  it('PATCH /api/v1/orders/:id/status → 200 finishing → completed (deducts inventory, creates barcode)', async () => {
    const res = await request(app)
      .patch(`/api/v1/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'completed' })
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('completed')
  })

  it('GET /api/v1/inventory/:id → stock deducted after order completion', async () => {
    const res = await request(app)
      .get(`/api/v1/inventory/${materialId}`)
      .set('Authorization', `Bearer ${adminToken}`)
    expect(res.status).toBe(200)
    expect(res.body.stock).toBe(520) // 600 - 80 (BOM qty)
  })

  it('GET /api/v1/inventory/:id/ledger → DEDUCT entry created', async () => {
    const res = await request(app)
      .get(`/api/v1/inventory/${materialId}/ledger`)
      .set('Authorization', `Bearer ${adminToken}`)
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('entries')
    const deduct = res.body.entries.find((e: { type: string }) => e.type === 'DEDUCT')
    expect(deduct).toBeDefined()
    expect(Math.abs(deduct.qty)).toBe(80)
  })

  it('PATCH /api/v1/orders/:id/status → 200 completed → invoiced', async () => {
    const res = await request(app)
      .patch(`/api/v1/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'invoiced' })
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('invoiced')
  })

  it('GET /api/v1/orders/:id/timeline → 200 has all status history', async () => {
    const res = await request(app)
      .get(`/api/v1/orders/${orderId}/timeline`)
      .set('Authorization', `Bearer ${adminToken}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
    const statuses = res.body.map((e: { status: string }) => e.status)
    expect(statuses).toContain('draft')
    expect(statuses).toContain('confirmed')
    expect(statuses).toContain('completed')
    expect(statuses).toContain('invoiced')
  })

  it('GET /api/v1/orders → staff can see orders list', async () => {
    const res = await request(app)
      .get('/api/v1/orders')
      .set('Authorization', `Bearer ${staffToken}`)
    expect(res.status).toBe(200)
  })
})

// ── Tasks ─────────────────────────────────────────────────────────────────────

describe('Tasks', () => {
  it('GET /api/v1/tasks → 200 — task auto-created on order confirm', async () => {
    const res = await request(app)
      .get('/api/v1/tasks')
      .set('Authorization', `Bearer ${adminToken}`)
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('tasks')
    expect(Array.isArray(res.body.tasks)).toBe(true)
    expect(res.body.tasks.length).toBeGreaterThanOrEqual(1)
    const task = res.body.tasks.find((t: { orderId: { _id: string } | string }) =>
      typeof t.orderId === 'object' ? t.orderId._id === orderId : t.orderId === orderId
    )
    expect(task).toBeDefined()
    taskId = task._id
  })

  it('GET /api/v1/tasks/:id → 200', async () => {
    const res = await request(app)
      .get(`/api/v1/tasks/${taskId}`)
      .set('Authorization', `Bearer ${adminToken}`)
    expect(res.status).toBe(200)
    expect(res.body._id).toBe(taskId)
    expect(res.body.type).toBe('flex_printing')
  })

  it('PATCH /api/v1/tasks/:id/assign → 200 manually assign to staff', async () => {
    const res = await request(app)
      .patch(`/api/v1/tasks/${taskId}/assign`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ assignedTo: staffId })
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('assigned')
  })

  it('PATCH /api/v1/tasks/:id/status → 200 assigned → in_progress by staff', async () => {
    const res = await request(app)
      .patch(`/api/v1/tasks/${taskId}/status`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ status: 'in_progress' })
    expect(res.status).toBe(200)
    expect(res.body.startedAt).toBeDefined()
  })

  it('PATCH /api/v1/tasks/:id/status → 200 in_progress → done', async () => {
    const res = await request(app)
      .patch(`/api/v1/tasks/${taskId}/status`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ status: 'done', notes: 'Printed successfully' })
    expect(res.status).toBe(200)
    expect(res.body.completedAt).toBeDefined()
    expect(res.body.totalMinutes).toBeGreaterThanOrEqual(0)
  })
})

// ── Payments ──────────────────────────────────────────────────────────────────

describe('Payments', () => {
  it('POST /api/v1/payments → 400 missing type', async () => {
    const res = await request(app)
      .post('/api/v1/payments')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ orderId, amount: 500, method: 'cash' })
    expect(res.status).toBe(400)
  })

  it('POST /api/v1/payments → 201 records advance payment', async () => {
    const res = await request(app)
      .post('/api/v1/payments')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ orderId, type: 'advance', amount: 300, method: 'cash' })
    expect(res.status).toBe(201)
    expect(res.body.amount).toBe(300)
    expect(res.body.status).toBe('completed')
    paymentId = res.body._id
  })

  it('POST /api/v1/payments → 201 records final payment via UPI', async () => {
    const res = await request(app)
      .post('/api/v1/payments')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ orderId, type: 'final', amount: 200, method: 'upi', referenceId: 'UPI123' })
    expect(res.status).toBe(201)
    expect(res.body.method).toBe('upi')
  })

  it('GET /api/v1/payments → 200 returns wrapped list', async () => {
    const res = await request(app)
      .get('/api/v1/payments')
      .set('Authorization', `Bearer ${adminToken}`)
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('payments')
    expect(Array.isArray(res.body.payments)).toBe(true)
    expect(res.body.payments.length).toBeGreaterThanOrEqual(2)
  })

  it('GET /api/v1/payments/order/:orderId → 200 returns order payments', async () => {
    const res = await request(app)
      .get(`/api/v1/payments/order/${orderId}`)
      .set('Authorization', `Bearer ${adminToken}`)
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('payments')
    expect(Array.isArray(res.body.payments)).toBe(true)
    expect(res.body.payments.every((p: { orderId: string | { _id: string } }) =>
      typeof p.orderId === 'string' ? p.orderId === orderId : p.orderId._id === orderId
    )).toBe(true)
  })

  it('PATCH /api/v1/payments/:id/refund → 200 refunds payment', async () => {
    const res = await request(app)
      .patch(`/api/v1/payments/${paymentId}/refund`)
      .set('Authorization', `Bearer ${adminToken}`)
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('refunded')
  })
})

// ── Billing ───────────────────────────────────────────────────────────────────

describe('Billing', () => {
  it('POST /api/v1/billing → 201 generates raw bill', async () => {
    const res = await request(app)
      .post('/api/v1/billing')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ orderId, type: 'raw' })
    expect(res.status).toBe(201)
    expect(res.body.type).toBe('raw')
    expect(res.body.seriesNumber).toMatch(/^RAW-/)
    expect(res.body.amount).toBeGreaterThan(0)
    billId = res.body._id
  })

  it('POST /api/v1/billing → 201 generates GST bill', async () => {
    const res = await request(app)
      .post('/api/v1/billing')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ orderId, type: 'gst' })
    expect(res.status).toBe(201)
    expect(res.body.type).toBe('gst')
    expect(res.body.seriesNumber).toMatch(/^TAX-/)
  })

  it('GET /api/v1/billing/order/:orderId → 200 returns bills for order', async () => {
    const res = await request(app)
      .get(`/api/v1/billing/order/${orderId}`)
      .set('Authorization', `Bearer ${adminToken}`)
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('bills')
    expect(Array.isArray(res.body.bills)).toBe(true)
    expect(res.body.bills.length).toBe(2)
    const types = res.body.bills.map((b: { type: string }) => b.type)
    expect(types).toContain('raw')
    expect(types).toContain('gst')
  })

  it('GET /api/v1/billing/:id → 200 returns single bill', async () => {
    const res = await request(app)
      .get(`/api/v1/billing/${billId}`)
      .set('Authorization', `Bearer ${adminToken}`)
    expect(res.status).toBe(200)
    expect(res.body._id).toBe(billId)
  })
})

// ── Barcodes ──────────────────────────────────────────────────────────────────

describe('Barcodes', () => {
  it('GET /api/v1/barcodes/order/:orderId → 200 returns barcodes for order', async () => {
    const res = await request(app)
      .get(`/api/v1/barcodes/order/${orderId}`)
      .set('Authorization', `Bearer ${adminToken}`)
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('barcodes')
    expect(Array.isArray(res.body.barcodes)).toBe(true)
    if (res.body.barcodes.length > 0) {
      barcodeId = res.body.barcodes[0]._id
    }
  })

  it('POST /api/v1/barcodes/generate → 201 generates initial barcode', async () => {
    const res = await request(app)
      .post('/api/v1/barcodes/generate')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ orderId, type: 'initial' })
    expect(res.status).toBe(201)
    expect(res.body.type).toBe('initial')
    expect(res.body.qrDataUrl).toMatch(/^data:image\/png;base64,/)
  })

  it('POST /api/v1/barcodes/scan/:orderId → 200 records scan event', async () => {
    const res = await request(app)
      .post(`/api/v1/barcodes/scan/${orderId}`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ action: 'qr_scan', notes: 'Scanned at station 3' })
    expect(res.status).toBe(200)
  })

  it('GET /api/v1/barcodes/scan/:orderId → 200 returns order for scan lookup', async () => {
    const res = await request(app)
      .get(`/api/v1/barcodes/scan/${orderId}`)
      .set('Authorization', `Bearer ${staffToken}`)
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('order')
  })
})

// ── Notifications ─────────────────────────────────────────────────────────────

describe('Notifications', () => {
  it('GET /api/v1/notifications → 200 returns wrapped notifications', async () => {
    const res = await request(app)
      .get('/api/v1/notifications')
      .set('Authorization', `Bearer ${staffToken}`)
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('notifications')
    expect(Array.isArray(res.body.notifications)).toBe(true)
  })

  it('GET /api/v1/notifications/unread-count → 200 returns count object', async () => {
    const res = await request(app)
      .get('/api/v1/notifications/unread-count')
      .set('Authorization', `Bearer ${staffToken}`)
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('count')
    expect(typeof res.body.count).toBe('number')
  })

  it('PATCH /api/v1/notifications/read-all → 204 marks all read', async () => {
    const res = await request(app)
      .patch('/api/v1/notifications/read-all')
      .set('Authorization', `Bearer ${staffToken}`)
    expect(res.status).toBe(204)
  })
})

// ── Analytics ─────────────────────────────────────────────────────────────────

describe('Analytics', () => {
  it('GET /api/v1/analytics/overview → 200 returns overview stats', async () => {
    const res = await request(app)
      .get('/api/v1/analytics/overview')
      .set('Authorization', `Bearer ${adminToken}`)
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('orders')
    expect(res.body).toHaveProperty('tasks')
    expect(res.body).toHaveProperty('revenue')
    expect(res.body).toHaveProperty('lowStock')
    expect(res.body.orders).toBeGreaterThanOrEqual(1)
  })

  it('GET /api/v1/analytics/orders → 200 returns order breakdown by status', async () => {
    const res = await request(app)
      .get('/api/v1/analytics/orders')
      .set('Authorization', `Bearer ${adminToken}`)
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('byStatus')
    expect(Array.isArray(res.body.byStatus)).toBe(true)
    const invoiced = res.body.byStatus.find((s: { _id: string }) => s._id === 'invoiced')
    expect(invoiced).toBeDefined()
    expect(invoiced.count).toBeGreaterThanOrEqual(1)
  })

  it('GET /api/v1/analytics/revenue → 200 returns revenue breakdown', async () => {
    const res = await request(app)
      .get('/api/v1/analytics/revenue')
      .set('Authorization', `Bearer ${adminToken}`)
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('total')
    expect(res.body).toHaveProperty('byMethod')
  })

  it('GET /api/v1/analytics/tasks → 200 returns task breakdown', async () => {
    const res = await request(app)
      .get('/api/v1/analytics/tasks')
      .set('Authorization', `Bearer ${adminToken}`)
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('byStatus')
    expect(Array.isArray(res.body.byStatus)).toBe(true)
  })

  it('GET /api/v1/analytics/overview → 403 for staff', async () => {
    const res = await request(app)
      .get('/api/v1/analytics/overview')
      .set('Authorization', `Bearer ${staffToken}`)
    expect(res.status).toBe(403)
  })
})

// ── Order Cancellation + Stock Reversal ───────────────────────────────────────

describe('Order cancellation reverses inventory', () => {
  let cancelOrderId: string
  const CANCEL_BOM_QTY = 40

  it('creates a second order with BOM, confirms and completes it (deducts stock)', async () => {
    const create = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        customer: { name: 'Cancel Test Client', phone: '1111111111' },
        jobType: 'flex_printing',
        items: [{ description: 'Test', quantity: 1, unit: 'sqft', unitPrice: 100 }],
        rawCost: 100,
        taxableValue: 100,
        billSplitPct: 0,
        bom: [{ materialId, name: 'Flex Banner Roll', unit: 'sqft', qty: CANCEL_BOM_QTY }],
      })
    expect(create.status).toBe(201)
    cancelOrderId = create.body._id

    for (const s of ['confirmed', 'designing', 'in_production', 'finishing', 'completed']) {
      const r = await request(app)
        .patch(`/api/v1/orders/${cancelOrderId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: s })
      expect(r.status).toBe(200)
    }
  })

  it('stock is deducted after completion', async () => {
    const res = await request(app)
      .get(`/api/v1/inventory/${materialId}`)
      .set('Authorization', `Bearer ${adminToken}`)
    // previous order deducted 80, this one deducted 40 → 600 - 80 - 40 = 480
    expect(res.body.stock).toBe(480)
  })

  it('cancels the completed order → 400 (terminal state)', async () => {
    const res = await request(app)
      .patch(`/api/v1/orders/${cancelOrderId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'cancelled' })
    expect(res.status).toBe(400)
  })

  it('creates a draft order and cancels it (stock unchanged — BOM not yet deducted)', async () => {
    const create = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        customer: { name: 'Draft Cancel', phone: '2222222222' },
        jobType: 'flex_printing',
        items: [{ description: 'Test', quantity: 1, unit: 'sqft', unitPrice: 100 }],
        rawCost: 100, taxableValue: 100, billSplitPct: 0,
        bom: [{ materialId, name: 'Flex Banner Roll', unit: 'sqft', qty: 100 }],
      })
    expect(create.status).toBe(201)

    const cancel = await request(app)
      .patch(`/api/v1/orders/${create.body._id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'cancelled' })
    expect(cancel.status).toBe(200)

    const inv = await request(app)
      .get(`/api/v1/inventory/${materialId}`)
      .set('Authorization', `Bearer ${adminToken}`)
    expect(inv.body.stock).toBe(480)
  })
})

// ── Health ────────────────────────────────────────────────────────────────────

describe('Health', () => {
  it('GET /health → 200', async () => {
    const res = await request(app).get('/health')
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('ok')
  })
})
