/**
 * E2E: Billing & Payment Flow
 *
 * Covers the financial pipeline for a completed order:
 *   Create order → complete it → generate raw + GST bills → record payment → refund
 *
 * Verifies:
 *  - RAW-YYYY-NNN and TAX-YYYY-NNN series number formats
 *  - raw bill: amount = order.rawCost, isProtected = true
 *  - gst bill: cgst/sgst computed at 9% each
 *  - Payment status lifecycle (completed → refunded)
 *  - Lists are scoped to the correct order
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { app, request, auth, seedUser, seedOrder, transitionThrough } from './helpers'

const YEAR = new Date().getFullYear()
const RAW_RE = /^RAW-\d{4}-\d{3}$/
const TAX_RE = /^TAX-\d{4}-\d{3}$/

describe('E2E — Billing & Payment Flow', () => {
  let superAdminToken: string
  let superAdminId:    string
  let adminToken:      string
  let orderId:         string

  beforeEach(async () => {
    const sa    = await seedUser('super_admin', 'sa@poms.com')
    superAdminToken = sa.token
    superAdminId    = sa.id

    const admin = await seedUser('admin', 'admin@poms.com')
    adminToken  = admin.token

    const order = await seedOrder(superAdminId, { rawCost: 500, taxableValue: 300 })
    orderId = order._id.toString()
  })

  // ── Bill creation ────────────────────────────────────────────────────────
  it('creates a raw bill with correct seriesNumber, amount, and isProtected=true', async () => {
    const res = await request(app)
      .post('/api/v1/billing')
      .set(auth(superAdminToken))
      .send({ orderId, type: 'raw' })

    expect(res.status).toBe(201)
    expect(res.body.type).toBe('raw')
    expect(res.body.seriesNumber).toMatch(RAW_RE)
    expect(res.body.seriesNumber).toContain(`${YEAR}`)
    expect(res.body.amount).toBe(500)
    expect(res.body.isProtected).toBe(true)
    expect(res.body.lineItems).toHaveLength(1)
    expect(res.body.lineItems[0].description).toBe('Banner print')
  })

  it('creates a gst bill with correct seriesNumber, cgst, sgst, and totalAmount', async () => {
    const res = await request(app)
      .post('/api/v1/billing')
      .set(auth(superAdminToken))
      .send({ orderId, type: 'gst' })

    expect(res.status).toBe(201)
    expect(res.body.type).toBe('gst')
    expect(res.body.seriesNumber).toMatch(TAX_RE)
    expect(res.body.amount).toBe(300)              // taxableValue
    expect(res.body.cgst).toBe(27)                 // 300 * 9%
    expect(res.body.sgst).toBe(27)
    expect(res.body.totalAmount).toBe(354)         // 300 + 27 + 27
    expect(res.body.isProtected).toBe(false)
  })

  it('series numbers increment for bills of the same type', async () => {
    const first = await request(app)
      .post('/api/v1/billing')
      .set(auth(superAdminToken))
      .send({ orderId, type: 'raw' })

    const second = await request(app)
      .post('/api/v1/billing')
      .set(auth(superAdminToken))
      .send({ orderId, type: 'raw' })

    expect(first.body.seriesNumber).toMatch(/-001$/)
    expect(second.body.seriesNumber).toMatch(/-002$/)
  })

  it('RAW and TAX series are independent (each starts at 001)', async () => {
    const raw = await request(app)
      .post('/api/v1/billing')
      .set(auth(superAdminToken))
      .send({ orderId, type: 'raw' })

    const gst = await request(app)
      .post('/api/v1/billing')
      .set(auth(superAdminToken))
      .send({ orderId, type: 'gst' })

    expect(raw.body.seriesNumber).toMatch(/^RAW-\d{4}-001$/)
    expect(gst.body.seriesNumber).toMatch(/^TAX-\d{4}-001$/)
  })

  it('lists all bills for an order', async () => {
    await request(app).post('/api/v1/billing').set(auth(superAdminToken)).send({ orderId, type: 'raw' })
    await request(app).post('/api/v1/billing').set(auth(superAdminToken)).send({ orderId, type: 'gst' })

    const res = await request(app)
      .get(`/api/v1/billing/order/${orderId}`)
      .set(auth(superAdminToken))

    expect(res.status).toBe(200)
    expect(res.body.bills).toHaveLength(2)
    expect(res.body.total).toBe(2)
    const types = res.body.bills.map((b: { type: string }) => b.type)
    expect(types).toContain('raw')
    expect(types).toContain('gst')
  })

  it('returns 403 when admin (no billing.create) tries to create a bill', async () => {
    const res = await request(app)
      .post('/api/v1/billing')
      .set(auth(adminToken))
      .send({ orderId, type: 'raw' })

    expect(res.status).toBe(403)
  })

  // ── Payment lifecycle ────────────────────────────────────────────────────
  it('records a payment and can be retrieved', async () => {
    const res = await request(app)
      .post('/api/v1/payments')
      .set(auth(adminToken))
      .send({ orderId, type: 'advance', amount: 200, method: 'cash' })

    expect(res.status).toBe(201)
    expect(res.body.status).toBe('completed')
    expect(res.body.paidAt).toBeDefined()
    expect(res.body.orderId).toBe(orderId)
  })

  it('refund changes status to refunded and returns the updated record', async () => {
    const createRes = await request(app)
      .post('/api/v1/payments')
      .set(auth(adminToken))
      .send({ orderId, type: 'partial', amount: 100, method: 'upi' })

    const paymentId = createRes.body._id

    const refundRes = await request(app)
      .patch(`/api/v1/payments/${paymentId}/refund`)
      .set(auth(adminToken))

    expect(refundRes.status).toBe(200)
    expect(refundRes.body.status).toBe('refunded')

    // Verify persisted status via GET
    const listRes = await request(app)
      .get(`/api/v1/payments/order/${orderId}`)
      .set(auth(adminToken))

    const refunded = listRes.body.payments.find((p: { _id: string }) => p._id === paymentId)
    expect(refunded.status).toBe('refunded')
  })

  it('payments for order are scoped correctly — another order has no payments', async () => {
    const otherOrder = await seedOrder(superAdminId)

    await request(app)
      .post('/api/v1/payments')
      .set(auth(adminToken))
      .send({ orderId, type: 'advance', amount: 500, method: 'card' })

    const res = await request(app)
      .get(`/api/v1/payments/order/${otherOrder._id}`)
      .set(auth(adminToken))

    expect(res.body.payments).toHaveLength(0)
    expect(res.body.total).toBe(0)
  })
})
