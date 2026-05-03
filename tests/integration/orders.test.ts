import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import { app } from '../../src/app'
import { User } from '../../src/modules/auth/auth.model'
import { Order } from '../../src/modules/orders/order.model'
import { Customer } from '../../src/modules/customers/customer.model'
import { Coupon } from '../../src/modules/loyalty/coupon.model'
import { makeUser, makeOrder } from '../helpers/mock-factory'
import jwt from 'jsonwebtoken'
import { env } from '../../src/config/env'

function signToken(payload: { _id: string; role: string; email: string }) {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: '1h' })
}

// Payload shape for POST /orders that passes Zod validation
function orderPayload(overrides: Record<string, unknown> = {}) {
  return {
    customer:     { name: 'Test Customer', phone: '9999999999', email: 'customer@test.com' },
    jobType:      'flex_printing',
    items:        [{ description: 'Banner print', quantity: 2, unit: 'sqft', unitPrice: 250 }],
    rawCost:      500,
    taxableValue: 300,
    billSplitPct: 40,
    ...overrides,
  }
}

describe('Orders API — Integration', () => {
  let adminToken: string
  let adminId: string

  beforeEach(async () => {
    const admin = await User.create(makeUser({ email: 'admin@poms.com', password: 'password123', role: 'admin' }))
    adminId = admin._id.toString()
    adminToken = signToken({ _id: adminId, role: 'admin', email: 'admin@poms.com' })
  })

  // ──────────────────────────────────────────────
  // GET /api/v1/orders
  // ──────────────────────────────────────────────
  describe('GET /api/v1/orders', () => {
    it('200 — returns orders array and total', async () => {
      await Order.create({ ...makeOrder(), createdBy: adminId })
      await Order.create({ ...makeOrder({ customer: { name: 'Second Customer', phone: '8888888888', email: 'c2@test.com' } }), createdBy: adminId })

      const res = await request(app)
        .get('/api/v1/orders')
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      expect(Array.isArray(res.body.orders)).toBe(true)
      expect(res.body.total).toBe(2)
    })

    it('200 — paginates with page/limit and exposes pages metadata', async () => {
      for (let i = 0; i < 5; i++) {
        await Order.create({
          ...makeOrder({ customer: { name: `Cust ${i}`, phone: `90000000${i}0`, email: `c${i}@x.com` } }),
          createdBy: adminId,
        })
      }

      const res = await request(app)
        .get('/api/v1/orders?page=2&limit=2')
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      expect(res.body.total).toBe(5)
      expect(res.body.page).toBe(2)
      expect(res.body.limit).toBe(2)
      expect(res.body.pages).toBe(3)
      expect(res.body.orders).toHaveLength(2)
    })

    it('200 — filters by status query param', async () => {
      await Order.create({ ...makeOrder(), status: 'confirmed', createdBy: adminId })
      await Order.create({ ...makeOrder({ customer: { name: 'Draft Customer', phone: '7777777777', email: 'c3@test.com' } }), status: 'draft', createdBy: adminId })

      const res = await request(app)
        .get('/api/v1/orders?status=confirmed')
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      expect(res.body.total).toBe(1)
      expect(res.body.orders[0].status).toBe('confirmed')
    })

    it('200 — scopeToOwn: flex_printing_staff only sees orders they created', async () => {
      // Admin creates an order — staff should NOT see it (own:true)
      await Order.create({ ...makeOrder(), createdBy: adminId })

      const staff = await User.create(makeUser({ email: 'fpstaff_scope@poms.com', password: 'password123', role: 'flex_printing_staff' }))
      const staffToken = signToken({ _id: staff._id.toString(), role: 'flex_printing_staff', email: 'fpstaff_scope@poms.com' })

      const res = await request(app)
        .get('/api/v1/orders')
        .set('Authorization', `Bearer ${staffToken}`)

      expect(res.status).toBe(200)
      // Staff has orders.read with own:true — should not see admin's order
      expect(res.body.total).toBe(0)
    })

    it('200 — designer sees all orders (no own:true restriction)', async () => {
      // Designer has orders.read without own:true — sees all
      await Order.create({ ...makeOrder(), createdBy: adminId })

      const designer = await User.create(makeUser({ email: 'designer@poms.com', password: 'password123', role: 'designer' }))
      const designerToken = signToken({ _id: designer._id.toString(), role: 'designer', email: 'designer@poms.com' })

      const res = await request(app)
        .get('/api/v1/orders')
        .set('Authorization', `Bearer ${designerToken}`)

      expect(res.status).toBe(200)
      expect(res.body.total).toBeGreaterThanOrEqual(1)
    })

    it('401 — no token', async () => {
      const res = await request(app).get('/api/v1/orders')
      expect(res.status).toBe(401)
    })

  })

  // ──────────────────────────────────────────────
  // POST /api/v1/orders
  // ──────────────────────────────────────────────
  describe('POST /api/v1/orders', () => {
    it('201 — creates order with orderNumber (ORD-YYYY-XXXX) and status draft', async () => {
      const res = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(orderPayload())

      expect(res.status).toBe(201)
      expect(res.body.status).toBe('draft')
      expect(res.body.orderNumber).toMatch(/^ORD-\d{4}-\d{4}$/)
    })

    it('400 — missing required customer.name', async () => {
      const payload = orderPayload()
      ;(payload as Record<string, unknown>).customer = { phone: '9999999999' }

      const res = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(payload)

      expect(res.status).toBe(400)
    })

    it('400 — invalid jobType enum', async () => {
      const res = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(orderPayload({ jobType: 'invalid_type' }))

      expect(res.status).toBe(400)
    })

    it('400 — empty items array', async () => {
      const res = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(orderPayload({ items: [] }))

      expect(res.status).toBe(400)
    })

    it('201 — applies a valid coupon and stores discountAmount + appliedCouponCode', async () => {
      const customer = await Customer.create({ name: 'Loyal Cust', phone: '9876543210' })
      await Coupon.create({
        code:       'SAVE10',
        customerId: customer._id,
        type:       'percentage',
        value:      10,
        status:     'active',
        expiresAt:  new Date(Date.now() + 24 * 60 * 60 * 1000),
      })

      const res = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(orderPayload({ couponCode: 'SAVE10' }))

      expect(res.status).toBe(201)
      expect(res.body.appliedCouponCode).toBe('SAVE10')
      // 10% of (rawCost 500 + taxableValue 300) = 80
      expect(res.body.discountAmount).toBe(80)

      const reloaded = await Coupon.findOne({ code: 'SAVE10' }).lean()
      expect(reloaded?.status).toBe('used')
      expect(reloaded?.usedOnOrderId?.toString()).toBe(res.body._id)
    })

    it('400 — invalid coupon rolls back the order', async () => {
      const before = await Order.countDocuments({})

      const res = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(orderPayload({ couponCode: 'NOPE' }))

      expect(res.status).toBe(404)
      const after = await Order.countDocuments({})
      expect(after).toBe(before)
    })

    it('401 — no token', async () => {
      const res = await request(app).post('/api/v1/orders').send(orderPayload())
      expect(res.status).toBe(401)
    })

    it('403 — flex_printing_staff cannot create orders', async () => {
      const staff = await User.create(makeUser({ email: 'staff2@poms.com', password: 'password123', role: 'flex_printing_staff' }))
      const staffToken = signToken({ _id: staff._id.toString(), role: 'flex_printing_staff', email: 'staff2@poms.com' })

      const res = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${staffToken}`)
        .send(orderPayload())

      expect(res.status).toBe(403)
    })
  })

  // ──────────────────────────────────────────────
  // GET /api/v1/orders/:id
  // ──────────────────────────────────────────────
  describe('GET /api/v1/orders/:id', () => {
    it('200 — returns order by id', async () => {
      const order = await Order.create({ ...makeOrder(), createdBy: adminId })

      const res = await request(app)
        .get(`/api/v1/orders/${order._id}`)
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      expect(res.body._id).toBe(order._id.toString())
    })

    it('400 — malformed ObjectId', async () => {
      const res = await request(app)
        .get('/api/v1/orders/not-a-valid-id')
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(400)
    })

    it('404 — valid ObjectId but not found', async () => {
      const fakeId = '000000000000000000000001'

      const res = await request(app)
        .get(`/api/v1/orders/${fakeId}`)
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(404)
    })

    it('401 — no token', async () => {
      const res = await request(app).get('/api/v1/orders/000000000000000000000001')
      expect(res.status).toBe(401)
    })
  })

  // ──────────────────────────────────────────────
  // PATCH /api/v1/orders/:id
  // ──────────────────────────────────────────────
  describe('PATCH /api/v1/orders/:id', () => {
    it('200 — updates notes and priority', async () => {
      const order = await Order.create({ ...makeOrder(), createdBy: adminId })

      const res = await request(app)
        .patch(`/api/v1/orders/${order._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ notes: 'Rush this job', priority: 'urgent' })

      expect(res.status).toBe(200)
      expect(res.body.notes).toBe('Rush this job')
      expect(res.body.priority).toBe('urgent')
    })

    it('404 — order not found', async () => {
      const fakeId = '000000000000000000000001'

      const res = await request(app)
        .patch(`/api/v1/orders/${fakeId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ notes: 'Ghost' })

      expect(res.status).toBe(404)
    })

    it('401 — no token', async () => {
      const res = await request(app)
        .patch('/api/v1/orders/000000000000000000000001')
        .send({ notes: 'x' })

      expect(res.status).toBe(401)
    })
  })

  // ──────────────────────────────────────────────
  // DELETE /api/v1/orders/:id  (cancel via super_admin)
  // ──────────────────────────────────────────────
  describe('DELETE /api/v1/orders/:id', () => {
    it('204 — super_admin can cancel an order', async () => {
      const sa = await User.create(makeUser({ email: 'sa@poms.com', password: 'password123', role: 'super_admin' }))
      const saToken = signToken({ _id: sa._id.toString(), role: 'super_admin', email: 'sa@poms.com' })
      const order = await Order.create({ ...makeOrder(), createdBy: sa._id.toString() })

      const res = await request(app)
        .delete(`/api/v1/orders/${order._id}`)
        .set('Authorization', `Bearer ${saToken}`)

      expect(res.status).toBe(204)

      const updated = await Order.findById(order._id)
      expect(updated?.status).toBe('cancelled')
    })

    it('403 — admin does not have orders.delete', async () => {
      const order = await Order.create({ ...makeOrder(), createdBy: adminId })

      const res = await request(app)
        .delete(`/api/v1/orders/${order._id}`)
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(403)
    })

    it('401 — no token', async () => {
      const res = await request(app).delete('/api/v1/orders/000000000000000000000001')
      expect(res.status).toBe(401)
    })
  })

  // ──────────────────────────────────────────────
  // PATCH /api/v1/orders/:id/status
  // ──────────────────────────────────────────────
  describe('PATCH /api/v1/orders/:id/status', () => {
    it('200 — valid transition: draft → confirmed', async () => {
      const order = await Order.create({ ...makeOrder(), createdBy: adminId })

      const res = await request(app)
        .patch(`/api/v1/orders/${order._id}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'confirmed' })

      expect(res.status).toBe(200)
      expect(res.body.status).toBe('confirmed')
    })

    it('400 — invalid transition: draft → completed (skips states)', async () => {
      const order = await Order.create({ ...makeOrder(), createdBy: adminId })

      const res = await request(app)
        .patch(`/api/v1/orders/${order._id}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'completed' })

      expect(res.status).toBe(400)
    })

    it('400 — malformed ObjectId', async () => {
      const res = await request(app)
        .patch('/api/v1/orders/not-a-valid-id/status')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'confirmed' })

      expect(res.status).toBe(400)
    })

    it('404 — order not found', async () => {
      const fakeId = '000000000000000000000001'

      const res = await request(app)
        .patch(`/api/v1/orders/${fakeId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'confirmed' })

      expect(res.status).toBe(404)
    })

    it('401 — no token', async () => {
      const res = await request(app)
        .patch('/api/v1/orders/000000000000000000000001/status')
        .send({ status: 'confirmed' })

      expect(res.status).toBe(401)
    })
  })

  // ──────────────────────────────────────────────
  // GET /api/v1/orders/:id/timeline
  // ──────────────────────────────────────────────
  describe('GET /api/v1/orders/:id/timeline', () => {
    it('200 — returns array of statusHistory entries', async () => {
      const order = await Order.create({
        ...makeOrder(),
        createdBy: adminId,
        statusHistory: [
          { status: 'draft', changedBy: adminId, at: new Date() },
        ],
      })

      const res = await request(app)
        .get(`/api/v1/orders/${order._id}/timeline`)
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      expect(Array.isArray(res.body)).toBe(true)
      expect(res.body[0].status).toBe('draft')
    })

    it('404 — order not found', async () => {
      const fakeId = '000000000000000000000001'

      const res = await request(app)
        .get(`/api/v1/orders/${fakeId}/timeline`)
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(404)
    })

    it('401 — no token', async () => {
      const res = await request(app).get('/api/v1/orders/000000000000000000000001/timeline')
      expect(res.status).toBe(401)
    })
  })

  // ──────────────────────────────────────────────
  // RBAC — flex_printing_staff restricted access
  // staff has: orders.read (own:true) but NO create/update/delete
  // ──────────────────────────────────────────────
  describe('RBAC — flex_printing_staff restricted access', () => {
    let staffToken: string
    let staffId: string

    beforeEach(async () => {
      const staff = await User.create(makeUser({ email: 'fpstaff3@poms.com', password: 'password123', role: 'flex_printing_staff' }))
      staffId = staff._id.toString()
      staffToken = signToken({ _id: staffId, role: 'flex_printing_staff', email: 'fpstaff3@poms.com' })
    })

    it('GET / returns 200 with empty list (own:true, owns nothing)', async () => {
      // Admin owns an order — staff can't see it
      await Order.create({ ...makeOrder(), createdBy: adminId })

      const res = await request(app)
        .get('/api/v1/orders')
        .set('Authorization', `Bearer ${staffToken}`)

      expect(res.status).toBe(200)
      expect(res.body.total).toBe(0)
    })

    it('POST / returns 403 (no orders.create)', async () => {
      const res = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${staffToken}`)
        .send(orderPayload())

      expect(res.status).toBe(403)
    })

    it('PATCH /:id returns 403 (no orders.update)', async () => {
      const order = await Order.create({ ...makeOrder(), createdBy: adminId })

      const res = await request(app)
        .patch(`/api/v1/orders/${order._id}`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ notes: 'Hacked' })

      expect(res.status).toBe(403)
    })

    it('DELETE /:id returns 403 (no orders.delete)', async () => {
      const order = await Order.create({ ...makeOrder(), createdBy: adminId })

      const res = await request(app)
        .delete(`/api/v1/orders/${order._id}`)
        .set('Authorization', `Bearer ${staffToken}`)

      expect(res.status).toBe(403)
    })

    it('PATCH /:id/status returns 403 (no orders.update)', async () => {
      const order = await Order.create({ ...makeOrder(), createdBy: adminId })

      const res = await request(app)
        .patch(`/api/v1/orders/${order._id}/status`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ status: 'confirmed' })

      expect(res.status).toBe(403)
    })
  })
})
