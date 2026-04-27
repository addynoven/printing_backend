/**
 * E2E: Order Lifecycle
 *
 * Verifies the complete state-machine path that every print job follows:
 *   draft → confirmed → designing → in_production → finishing → completed → invoiced
 *
 * Also checks that invalid transitions are rejected and that status history
 * is appended correctly at each step.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { app, request, auth, seedUser, seedOrder, transitionThrough } from './helpers'

describe('E2E — Order Lifecycle', () => {
  let adminToken: string
  let adminId:    string

  beforeEach(async () => {
    const admin = await seedUser('admin', 'admin@poms.com')
    adminToken = admin.token
    adminId    = admin.id
  })

  // ── Full happy path ──────────────────────────────────────────────────────
  it('drives an order through every state from draft to invoiced', async () => {
    // 1. Create
    const createRes = await request(app)
      .post('/api/v1/orders')
      .set(auth(adminToken))
      .send({
        customer: { name: 'Alice Corp', phone: '9876543210', email: 'alice@corp.com' },
        jobType:  'flex_printing',
        items:    [{ description: 'Flex Banner 4x8', quantity: 2, unit: 'sqft', unitPrice: 250 }],
        rawCost:      500,
        taxableValue: 300,
        billSplitPct: 40,
        priority:     'normal',
      })
    expect(createRes.status).toBe(201)
    expect(createRes.body.status).toBe('draft')

    const orderId = createRes.body._id

    // 2. Walk through all states
    const path = ['confirmed', 'designing', 'in_production', 'finishing', 'completed', 'invoiced']
    await transitionThrough(orderId, path, adminToken)

    // 3. Verify final state
    const finalRes = await request(app)
      .get(`/api/v1/orders/${orderId}`)
      .set(auth(adminToken))

    expect(finalRes.status).toBe(200)
    expect(finalRes.body.status).toBe('invoiced')
    // +1 because order is created with an initial 'draft' entry in statusHistory
    expect(finalRes.body.statusHistory).toHaveLength(path.length + 1)
    expect(finalRes.body.statusHistory.at(-1).status).toBe('invoiced')
  })

  it('records changedBy in statusHistory for each transition', async () => {
    const order = await seedOrder(adminId)
    const orderId = order._id.toString()

    await request(app)
      .patch(`/api/v1/orders/${orderId}/status`)
      .set(auth(adminToken))
      .send({ status: 'confirmed', note: 'Customer approved' })

    const res = await request(app)
      .get(`/api/v1/orders/${orderId}`)
      .set(auth(adminToken))

    const entry = res.body.statusHistory[0]
    expect(entry.status).toBe('confirmed')
    expect(entry.note).toBe('Customer approved')
    expect(entry.changedBy).toBe(adminId)
  })

  // ── Invalid transitions ──────────────────────────────────────────────────
  it('rejects a skip in the state machine (draft → in_production)', async () => {
    const order = await seedOrder(adminId)

    const res = await request(app)
      .patch(`/api/v1/orders/${order._id}/status`)
      .set(auth(adminToken))
      .send({ status: 'in_production' })

    expect(res.status).toBe(400)
  })

  it('rejects going backwards (confirmed → draft)', async () => {
    const order = await seedOrder(adminId)

    await transitionThrough(order._id.toString(), ['confirmed'], adminToken)

    const res = await request(app)
      .patch(`/api/v1/orders/${order._id}/status`)
      .set(auth(adminToken))
      .send({ status: 'draft' })

    expect(res.status).toBe(400)
  })

  it('rejects any transition on a cancelled order', async () => {
    const order = await seedOrder(adminId)
    const orderId = order._id.toString()

    await transitionThrough(orderId, ['confirmed', 'cancelled'], adminToken)

    const res = await request(app)
      .patch(`/api/v1/orders/${orderId}/status`)
      .set(auth(adminToken))
      .send({ status: 'designing' })

    expect(res.status).toBe(400)
  })

  // ── Filtering ────────────────────────────────────────────────────────────
  it('filters orders by status correctly', async () => {
    const orderA = await seedOrder(adminId)
    const orderB = await seedOrder(adminId)

    await transitionThrough(orderA._id.toString(), ['confirmed'], adminToken)
    // orderB stays draft

    const res = await request(app)
      .get('/api/v1/orders?status=confirmed')
      .set(auth(adminToken))

    expect(res.status).toBe(200)
    expect(res.body.orders.every((o: { status: string }) => o.status === 'confirmed')).toBe(true)
    expect(res.body.orders.map((o: { _id: string }) => o._id)).toContain(orderA._id.toString())
    expect(res.body.orders.map((o: { _id: string }) => o._id)).not.toContain(orderB._id.toString())
  })
})
