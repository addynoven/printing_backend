import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import { app } from '../../src/app'
import { User } from '../../src/modules/auth/auth.model'
import { Order } from '../../src/modules/orders/order.model'
import { makeUser, makeOrder } from '../helpers/mock-factory'
import jwt from 'jsonwebtoken'
import { env } from '../../src/config/env'

function signToken(payload: { _id: string; role: string; email: string }) {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: '1h' })
}

describe('Payments API — Integration', () => {
  let adminToken: string
  let adminId:    string
  let orderId:    string

  beforeEach(async () => {
    const admin = await User.create(makeUser({ email: 'admin@poms.com', password: 'password123', role: 'admin' }))
    adminId    = admin._id.toString()
    adminToken = signToken({ _id: adminId, role: 'admin', email: 'admin@poms.com' })

    const order = await Order.create({ ...makeOrder(), createdBy: adminId })
    orderId = order._id.toString()
  })

  // ──────────────────────────────────────────────
  // GET /api/v1/payments
  // ──────────────────────────────────────────────
  describe('GET /api/v1/payments', () => {
    it('200 — returns { payments, total } (RED: not implemented)', async () => {
      const res = await request(app)
        .get('/api/v1/payments')
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      expect(Array.isArray(res.body.payments)).toBe(true)
      expect(typeof res.body.total).toBe('number')
    })

    it('401 — no token', async () => {
      const res = await request(app).get('/api/v1/payments')
      expect(res.status).toBe(401)
    })

    it('403 — flex_printing_staff has no payments.read', async () => {
      const staff = await User.create(makeUser({ email: 'staff@poms.com', password: 'password123', role: 'flex_printing_staff' }))
      const staffToken = signToken({ _id: staff._id.toString(), role: 'flex_printing_staff', email: 'staff@poms.com' })

      const res = await request(app)
        .get('/api/v1/payments')
        .set('Authorization', `Bearer ${staffToken}`)

      expect(res.status).toBe(403)
    })
  })

  // ──────────────────────────────────────────────
  // POST /api/v1/payments
  // ──────────────────────────────────────────────
  describe('POST /api/v1/payments', () => {
    function validPayload(overrides: Record<string, unknown> = {}) {
      return {
        orderId,
        type:   'advance',
        amount: 500,
        method: 'cash',
        ...overrides,
      }
    }

    it('201 — creates payment (RED: not implemented)', async () => {
      const res = await request(app)
        .post('/api/v1/payments')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(validPayload())

      expect(res.status).toBe(201)
    })

    it('400 — missing orderId', async () => {
      const res = await request(app)
        .post('/api/v1/payments')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ type: 'advance', amount: 500, method: 'cash' })

      expect(res.status).toBe(400)
    })

    it('400 — invalid type enum', async () => {
      const res = await request(app)
        .post('/api/v1/payments')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(validPayload({ type: 'not_a_type' }))

      expect(res.status).toBe(400)
    })

    it('400 — amount must be positive (amount: -10)', async () => {
      const res = await request(app)
        .post('/api/v1/payments')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(validPayload({ amount: -10 }))

      expect(res.status).toBe(400)
    })

    it('400 — invalid method enum', async () => {
      const res = await request(app)
        .post('/api/v1/payments')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(validPayload({ method: 'bitcoin' }))

      expect(res.status).toBe(400)
    })

    it('401 — no token', async () => {
      const res = await request(app)
        .post('/api/v1/payments')
        .send(validPayload())

      expect(res.status).toBe(401)
    })

    it('403 — sub_admin has payments.read only, not payments.create', async () => {
      const subAdmin = await User.create(makeUser({ email: 'subadmin@poms.com', password: 'password123', role: 'sub_admin' }))
      const subToken = signToken({ _id: subAdmin._id.toString(), role: 'sub_admin', email: 'subadmin@poms.com' })

      const res = await request(app)
        .post('/api/v1/payments')
        .set('Authorization', `Bearer ${subToken}`)
        .send(validPayload())

      expect(res.status).toBe(403)
    })
  })

  // ──────────────────────────────────────────────
  // GET /api/v1/payments/order/:orderId
  // ──────────────────────────────────────────────
  describe('GET /api/v1/payments/order/:orderId', () => {
    it('200 — returns payments for order (RED: not implemented)', async () => {
      const res = await request(app)
        .get(`/api/v1/payments/order/${orderId}`)
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      expect(Array.isArray(res.body.payments)).toBe(true)
      expect(typeof res.body.total).toBe('number')
    })

    it('401 — no token', async () => {
      const res = await request(app).get(`/api/v1/payments/order/${orderId}`)
      expect(res.status).toBe(401)
    })
  })

  // ──────────────────────────────────────────────
  // PATCH /api/v1/payments/:id/refund
  // ──────────────────────────────────────────────
  describe('PATCH /api/v1/payments/:id/refund', () => {
    it('200 — marks payment as refunded', async () => {
      const createRes = await request(app)
        .post('/api/v1/payments')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ orderId, type: 'advance', amount: 500, method: 'cash' })

      const paymentId = createRes.body._id

      const res = await request(app)
        .patch(`/api/v1/payments/${paymentId}/refund`)
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      expect(res.body.status).toBe('refunded')
    })

    it('400 — malformed ObjectId (RED: service must attempt Mongoose query to trigger CastError)', async () => {
      const res = await request(app)
        .patch('/api/v1/payments/not-a-valid-id/refund')
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(400)
    })

    it('404 — valid ObjectId but payment not found (RED: not implemented)', async () => {
      const nonExistentId = '000000000000000000000001'

      const res = await request(app)
        .patch(`/api/v1/payments/${nonExistentId}/refund`)
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(404)
    })

    it('401 — no token', async () => {
      const validId = '000000000000000000000001'

      const res = await request(app)
        .patch(`/api/v1/payments/${validId}/refund`)

      expect(res.status).toBe(401)
    })
  })

  // ──────────────────────────────────────────────
  // RBAC — staff roles with no payments access
  // ──────────────────────────────────────────────
  describe('RBAC — designer has no payments access at all', () => {
    let designerToken: string

    beforeEach(async () => {
      const designer = await User.create(makeUser({ email: 'designer@poms.com', password: 'password123', role: 'designer' }))
      designerToken  = signToken({ _id: designer._id.toString(), role: 'designer', email: 'designer@poms.com' })
    })

    it('GET /payments returns 403 for designer', async () => {
      const res = await request(app)
        .get('/api/v1/payments')
        .set('Authorization', `Bearer ${designerToken}`)

      expect(res.status).toBe(403)
    })

    it('POST /payments returns 403 for designer', async () => {
      const res = await request(app)
        .post('/api/v1/payments')
        .set('Authorization', `Bearer ${designerToken}`)
        .send({ orderId, type: 'advance', amount: 500, method: 'cash' })

      expect(res.status).toBe(403)
    })

    it('GET /payments/order/:orderId returns 403 for designer', async () => {
      const res = await request(app)
        .get(`/api/v1/payments/order/${orderId}`)
        .set('Authorization', `Bearer ${designerToken}`)

      expect(res.status).toBe(403)
    })

    it('PATCH /payments/:id/refund returns 403 for designer', async () => {
      const res = await request(app)
        .patch(`/api/v1/payments/000000000000000000000001/refund`)
        .set('Authorization', `Bearer ${designerToken}`)

      expect(res.status).toBe(403)
    })
  })
})
