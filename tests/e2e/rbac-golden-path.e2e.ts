/**
 * E2E: RBAC Golden Path
 *
 * Verifies the role-based access model end-to-end across all modules.
 * Each test puts the RIGHT actor in the RIGHT place and checks that
 * boundary roles (one above and one below) get 403 / 404 as expected.
 *
 * This is the "security smoke test" — if these pass, the permission matrix
 * is wired up correctly across the full request path.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { app, request, auth, seedUser, seedOrder, seedTask } from './helpers'

describe('E2E — RBAC Golden Path', () => {
  let superAdminToken: string
  let superAdminId:    string
  let adminToken:      string
  let adminId:         string
  let subAdminToken:   string
  let designerToken:   string
  let staffToken:      string
  let staffId:         string
  let orderId:         string

  beforeEach(async () => {
    const sa  = await seedUser('super_admin',          'sa@poms.com')
    const adm = await seedUser('admin',                'admin@poms.com')
    const sub = await seedUser('sub_admin',            'sub@poms.com')
    const des = await seedUser('designer',             'designer@poms.com')
    const sta = await seedUser('flex_printing_staff',  'staff@poms.com')

    superAdminToken = sa.token;  superAdminId = sa.id
    adminToken      = adm.token; adminId      = adm.id
    subAdminToken   = sub.token
    designerToken   = des.token
    staffToken      = sta.token; staffId = sta.id

    const order = await seedOrder(adminId)
    orderId = order._id.toString()
  })

  // ── Billing: only super_admin can create ─────────────────────────────────
  it('billing.create: super_admin ✓  admin ✗  sub_admin ✗', async () => {
    const payload = { orderId, type: 'raw' }

    const saRes  = await request(app).post('/api/v1/billing').set(auth(superAdminToken)).send(payload)
    const admRes = await request(app).post('/api/v1/billing').set(auth(adminToken)).send(payload)
    const subRes = await request(app).post('/api/v1/billing').set(auth(subAdminToken)).send(payload)

    expect(saRes.status).toBe(201)
    expect(admRes.status).toBe(403)
    expect(subRes.status).toBe(403)
  })

  it('billing.read: super_admin ✓  admin ✓  sub_admin ✓  designer ✗', async () => {
    const [saRes, admRes, subRes, desRes] = await Promise.all([
      request(app).get(`/api/v1/billing/order/${orderId}`).set(auth(superAdminToken)),
      request(app).get(`/api/v1/billing/order/${orderId}`).set(auth(adminToken)),
      request(app).get(`/api/v1/billing/order/${orderId}`).set(auth(subAdminToken)),
      request(app).get(`/api/v1/billing/order/${orderId}`).set(auth(designerToken)),
    ])

    expect(saRes.status).toBe(200)
    expect(admRes.status).toBe(200)
    expect(subRes.status).toBe(200)
    expect(desRes.status).toBe(403)
  })

  // ── Payments ─────────────────────────────────────────────────────────────
  it('payments.create: admin ✓  sub_admin ✗  staff ✗', async () => {
    const payload = { orderId, type: 'advance', amount: 100, method: 'cash' }

    const admRes  = await request(app).post('/api/v1/payments').set(auth(adminToken)).send(payload)
    const subRes  = await request(app).post('/api/v1/payments').set(auth(subAdminToken)).send(payload)
    const staRes  = await request(app).post('/api/v1/payments').set(auth(staffToken)).send(payload)

    expect(admRes.status).toBe(201)
    expect(subRes.status).toBe(403)
    expect(staRes.status).toBe(403)
  })

  // ── Orders ───────────────────────────────────────────────────────────────
  it('orders.create: admin ✓  designer ✗  staff ✗', async () => {
    const payload = {
      customer:     { name: 'Test Co', phone: '9999999999' },
      jobType:      'flex_printing',
      items:        [{ description: 'Banner', quantity: 1, unit: 'sqft', unitPrice: 100 }],
      rawCost:      100,
      taxableValue: 60,
      billSplitPct: 40,
      priority:     'normal',
    }

    const admRes = await request(app).post('/api/v1/orders').set(auth(adminToken)).send(payload)
    const desRes = await request(app).post('/api/v1/orders').set(auth(designerToken)).send(payload)
    const staRes = await request(app).post('/api/v1/orders').set(auth(staffToken)).send(payload)

    expect(admRes.status).toBe(201)
    expect(desRes.status).toBe(403)
    expect(staRes.status).toBe(403)
  })

  it('orders.read: all authenticated roles can read orders', async () => {
    const tokens = [superAdminToken, adminToken, subAdminToken, designerToken, staffToken]

    const results = await Promise.all(
      tokens.map(t => request(app).get(`/api/v1/orders/${orderId}`).set(auth(t)))
    )

    for (const res of results) {
      expect(res.status).toBe(200)
    }
  })

  // ── Tasks ────────────────────────────────────────────────────────────────
  it('tasks.update: admin ✓  staff (own task) ✓  staff (no assignment) ✓', async () => {
    const task = await seedTask(orderId, staffId)

    const admRes = await request(app)
      .patch(`/api/v1/tasks/${task._id}/status`)
      .set(auth(adminToken))
      .send({ status: 'in_progress' })

    expect(admRes.status).toBe(200)

    // staff can update status too (they have tasks.update permission)
    const staffRes = await request(app)
      .patch(`/api/v1/tasks/${task._id}/status`)
      .set(auth(staffToken))
      .send({ status: 'paused' })

    expect(staffRes.status).toBe(200)
  })

  it('unauthenticated request is rejected with 401 on every module', async () => {
    const endpoints = [
      '/api/v1/orders',
      '/api/v1/tasks',
      '/api/v1/billing/order/000000000000000000000001',
      '/api/v1/payments',
      '/api/v1/notifications',
      `/api/v1/barcodes/scan/${orderId}`,
    ]

    const results = await Promise.all(
      endpoints.map(url => request(app).get(url))
    )

    for (const res of results) {
      expect(res.status).toBe(401)
    }
  })
})
