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

describe('Barcodes API — Integration', () => {
  let adminToken: string
  let adminId: string
  let orderId: string

  // Role with no permissions in PERMISSIONS map → permit() returns 403
  let noPermToken: string

  beforeEach(async () => {
    const admin = await User.create(
      makeUser({ email: 'admin@barcodes.com', password: 'password123', role: 'admin' })
    )
    adminId    = admin._id.toString()
    adminToken = signToken({ _id: adminId, role: 'admin', email: 'admin@barcodes.com' })

    // 'viewer' is not a key in PERMISSIONS — permit() will resolve to 403
    noPermToken = signToken({ _id: adminId, role: 'viewer', email: 'admin@barcodes.com' })

    const order = await Order.create(
      makeOrder({ createdBy: adminId })
    )
    orderId = order._id.toString()
  })

  // ──────────────────────────────────────────────
  // POST /api/v1/barcodes/generate
  // ──────────────────────────────────────────────
  describe('POST /api/v1/barcodes/generate', () => {
    it('returns 201 with barcode containing qrDataUrl (RED — service throws)', async () => {
      const res = await request(app)
        .post('/api/v1/barcodes/generate')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ orderId, type: 'initial' })

      expect(res.status).toBe(201)
      expect(res.body).toHaveProperty('qrDataUrl')
    })

    it('returns 400 when orderId is missing', async () => {
      const res = await request(app)
        .post('/api/v1/barcodes/generate')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ type: 'initial' })

      expect(res.status).toBe(400)
    })

    it('returns 400 when type is invalid (not initial or final)', async () => {
      const res = await request(app)
        .post('/api/v1/barcodes/generate')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ orderId, type: 'unknown_type' })

      expect(res.status).toBe(400)
    })

    it('returns 401 when no token is provided', async () => {
      const res = await request(app)
        .post('/api/v1/barcodes/generate')
        .send({ orderId, type: 'initial' })

      expect(res.status).toBe(401)
    })

    it('returns 403 for role without orders.read permission', async () => {
      const res = await request(app)
        .post('/api/v1/barcodes/generate')
        .set('Authorization', `Bearer ${noPermToken}`)
        .send({ orderId, type: 'initial' })

      expect(res.status).toBe(403)
    })
  })

  // ──────────────────────────────────────────────
  // GET /api/v1/barcodes/order/:orderId
  // ──────────────────────────────────────────────
  describe('GET /api/v1/barcodes/order/:orderId', () => {
    it('returns 200 with { barcodes, total } (RED — service throws)', async () => {
      const res = await request(app)
        .get(`/api/v1/barcodes/order/${orderId}`)
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      expect(res.body).toHaveProperty('barcodes')
      expect(res.body).toHaveProperty('total')
    })

    it('returns 401 when no token is provided', async () => {
      const res = await request(app)
        .get(`/api/v1/barcodes/order/${orderId}`)

      expect(res.status).toBe(401)
    })
  })

  // ──────────────────────────────────────────────
  // GET /api/v1/barcodes/scan/:orderId
  // ──────────────────────────────────────────────
  describe('GET /api/v1/barcodes/scan/:orderId', () => {
    it('returns 200 with scan page data (RED — service throws)', async () => {
      const res = await request(app)
        .get(`/api/v1/barcodes/scan/${orderId}`)
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      expect(res.body).toBeDefined()
    })

    it('returns 400 for malformed ObjectId', async () => {
      const res = await request(app)
        .get('/api/v1/barcodes/scan/not-a-valid-id')
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(400)
    })

    it('returns 401 when no token is provided', async () => {
      const res = await request(app)
        .get(`/api/v1/barcodes/scan/${orderId}`)

      expect(res.status).toBe(401)
    })
  })

  // ──────────────────────────────────────────────
  // POST /api/v1/barcodes/scan/:orderId
  // ──────────────────────────────────────────────
  describe('POST /api/v1/barcodes/scan/:orderId', () => {
    it('returns 200 and records scan event (RED — service throws)', async () => {
      const res = await request(app)
        .post(`/api/v1/barcodes/scan/${orderId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ action: 'in_progress' })

      expect(res.status).toBe(200)
      expect(res.body).toHaveProperty('scanEvent')
    })

    it('returns 400 when action is missing', async () => {
      const res = await request(app)
        .post(`/api/v1/barcodes/scan/${orderId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({})

      expect(res.status).toBe(400)
    })

    it('returns 400 for malformed ObjectId', async () => {
      const res = await request(app)
        .post('/api/v1/barcodes/scan/not-a-valid-id')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ action: 'done' })

      expect(res.status).toBe(400)
    })

    it('returns 401 when no token is provided', async () => {
      const res = await request(app)
        .post(`/api/v1/barcodes/scan/${orderId}`)
        .send({ action: 'in_progress' })

      expect(res.status).toBe(401)
    })
  })
})
