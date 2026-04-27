import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import mongoose from 'mongoose'
import jwt from 'jsonwebtoken'
import { app } from '../../src/app'
import { User } from '../../src/modules/auth/auth.model'
import { Order } from '../../src/modules/orders/order.model'
import { env } from '../../src/config/env'
import { makeUser, makeOrder } from '../helpers/mock-factory'

// Build a signed JWT without hitting the login endpoint
function signToken(payload: { _id: string; role: string; email: string }) {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: '1h' })
}

// ─── Permissions reference ────────────────────────────────────────────────────
// super_admin: billing.create billing.read billing.update billing.delete
// admin:       billing.read  (NO create)
// sub_admin:   billing.read  (NO create)
// designer:    NO billing access at all
// staff roles: NO billing access at all
// ─────────────────────────────────────────────────────────────────────────────

describe('Billing API — Integration', () => {
  let superAdminToken: string
  let superAdminId:    string
  let subAdminToken:   string
  let staffToken:      string
  let orderId:         string

  beforeEach(async () => {
    // Super admin — only role with billing.create
    const sa = await User.create(
      makeUser({ email: 'sa@poms.com', password: 'password123', role: 'super_admin' })
    )
    superAdminId    = sa._id.toString()
    superAdminToken = signToken({ _id: superAdminId, role: 'super_admin', email: 'sa@poms.com' })

    // Sub admin — billing.read only, no billing.create
    const subAdmin = await User.create(
      makeUser({ email: 'subadmin@poms.com', password: 'password123', role: 'sub_admin' })
    )
    subAdminToken = signToken({ _id: subAdmin._id.toString(), role: 'sub_admin', email: 'subadmin@poms.com' })

    // Designer — no billing permissions at all
    const designer = await User.create(
      makeUser({ email: 'designer@poms.com', password: 'password123', role: 'designer' })
    )
    staffToken = signToken({ _id: designer._id.toString(), role: 'designer', email: 'designer@poms.com' })

    // Real order to use as fixture
    const order = await Order.create({
      ...makeOrder(),
      createdBy: new mongoose.Types.ObjectId(superAdminId),
    })
    orderId = order._id.toString()
  })

  // ──────────────────────────────────────────────
  // POST /api/v1/billing
  // ──────────────────────────────────────────────
  describe('POST /api/v1/billing', () => {
    it('201 creates a bill for a valid order (RED — service not implemented)', async () => {
      const res = await request(app)
        .post('/api/v1/billing')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ orderId, type: 'raw' })

      // Will be RED: service throws 'not implemented' → 500
      expect(res.status).toBe(201)
    })

    it('201 creates a gst bill (RED — service not implemented)', async () => {
      const res = await request(app)
        .post('/api/v1/billing')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ orderId, type: 'gst' })

      expect(res.status).toBe(201)
    })

    it('400 when orderId is missing', async () => {
      const res = await request(app)
        .post('/api/v1/billing')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ type: 'raw' })

      expect(res.status).toBe(400)
    })

    it('400 when type is an invalid enum value', async () => {
      const res = await request(app)
        .post('/api/v1/billing')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ orderId, type: 'invoice' })

      expect(res.status).toBe(400)
    })

    it('401 when no token provided', async () => {
      const res = await request(app)
        .post('/api/v1/billing')
        .send({ orderId, type: 'raw' })

      expect(res.status).toBe(401)
    })

    it('403 sub_admin cannot create bills (billing.read only, no billing.create)', async () => {
      const res = await request(app)
        .post('/api/v1/billing')
        .set('Authorization', `Bearer ${subAdminToken}`)
        .send({ orderId, type: 'raw' })

      expect(res.status).toBe(403)
    })
  })

  // ──────────────────────────────────────────────
  // GET /api/v1/billing/order/:orderId
  // ──────────────────────────────────────────────
  describe('GET /api/v1/billing/order/:orderId', () => {
    it('200 returns bills for order (RED — service not implemented)', async () => {
      const res = await request(app)
        .get(`/api/v1/billing/order/${orderId}`)
        .set('Authorization', `Bearer ${superAdminToken}`)

      // Will be RED: service throws 'not implemented' → 500
      expect(res.status).toBe(200)
    })

    it('401 when no token provided', async () => {
      const res = await request(app)
        .get(`/api/v1/billing/order/${orderId}`)

      expect(res.status).toBe(401)
    })
  })

  // ──────────────────────────────────────────────
  // GET /api/v1/billing/:id
  // ──────────────────────────────────────────────
  describe('GET /api/v1/billing/:id', () => {
    it('200 returns bill by id', async () => {
      const createRes = await request(app)
        .post('/api/v1/billing')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ orderId, type: 'raw' })

      const billId = createRes.body._id

      const res = await request(app)
        .get(`/api/v1/billing/${billId}`)
        .set('Authorization', `Bearer ${superAdminToken}`)

      expect(res.status).toBe(200)
      expect(res.body._id).toBe(billId)
    })

    it('400 malformed ObjectId returns 400', async () => {
      const res = await request(app)
        .get('/api/v1/billing/not-a-valid-objectid')
        .set('Authorization', `Bearer ${superAdminToken}`)

      expect(res.status).toBe(400)
    })

    it('404 valid ObjectId that does not exist', async () => {
      const nonExistentId = '000000000000000000000001'

      const res = await request(app)
        .get(`/api/v1/billing/${nonExistentId}`)
        .set('Authorization', `Bearer ${superAdminToken}`)

      // Will be RED: service throws 'not implemented' → 500
      expect(res.status).toBe(404)
    })

    it('401 when no token provided', async () => {
      const fakeId = new mongoose.Types.ObjectId().toString()

      const res = await request(app)
        .get(`/api/v1/billing/${fakeId}`)

      expect(res.status).toBe(401)
    })
  })

  // ──────────────────────────────────────────────
  // RBAC — roles with no billing access at all
  // designer has no billing permissions in permissions.ts
  // ──────────────────────────────────────────────
  describe('RBAC — designer role blocked from all billing routes', () => {
    it('POST / returns 403 for designer', async () => {
      const res = await request(app)
        .post('/api/v1/billing')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ orderId, type: 'raw' })

      expect(res.status).toBe(403)
    })

    it('GET /order/:orderId returns 403 for designer', async () => {
      const res = await request(app)
        .get(`/api/v1/billing/order/${orderId}`)
        .set('Authorization', `Bearer ${staffToken}`)

      expect(res.status).toBe(403)
    })

    it('GET /:id returns 403 for designer', async () => {
      const fakeId = new mongoose.Types.ObjectId().toString()

      const res = await request(app)
        .get(`/api/v1/billing/${fakeId}`)
        .set('Authorization', `Bearer ${staffToken}`)

      expect(res.status).toBe(403)
    })
  })
})
