import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import { app } from '../../src/app'
import { User } from '../../src/modules/auth/auth.model'
import { Order } from '../../src/modules/orders/order.model'
import { Task } from '../../src/modules/tasks/task.model'
import { Payment } from '../../src/modules/payments/payment.model'
import { env } from '../../src/config/env'
import { makeUser, makeOrder } from '../helpers/mock-factory'

function signToken(payload: { _id: string; role: string; email: string }) {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: '1h' })
}

// analytics.read: super_admin, admin only
// sub_admin, designer, staff: NO analytics access

describe('Analytics API — Integration', () => {
  let adminToken:    string
  let adminId:       string
  let subAdminToken: string

  beforeEach(async () => {
    const admin = await User.create(
      makeUser({ email: 'admin@poms.com', password: 'password123', role: 'admin' })
    )
    adminId    = admin._id.toString()
    adminToken = signToken({ _id: adminId, role: 'admin', email: 'admin@poms.com' })

    const sub = await User.create(
      makeUser({ email: 'sub@poms.com', password: 'password123', role: 'sub_admin' })
    )
    subAdminToken = signToken({ _id: sub._id.toString(), role: 'sub_admin', email: 'sub@poms.com' })
  })

  // ── GET /analytics/overview ───────────────────────────────────────────────
  describe('GET /api/v1/analytics/overview', () => {
    it('200 — returns orders, tasks, revenue, lowStock counts', async () => {
      const res = await request(app)
        .get('/api/v1/analytics/overview')
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      expect(res.body).toMatchObject({
        orders:   expect.any(Number),
        tasks:    expect.any(Number),
        revenue:  expect.any(Number),
        lowStock: expect.any(Number),
      })
    })

    it('401 — unauthenticated request rejected', async () => {
      const res = await request(app).get('/api/v1/analytics/overview')
      expect(res.status).toBe(401)
    })

    it('403 — sub_admin has no analytics access', async () => {
      const res = await request(app)
        .get('/api/v1/analytics/overview')
        .set('Authorization', `Bearer ${subAdminToken}`)
      expect(res.status).toBe(403)
    })

    it('revenue reflects completed payments only', async () => {
      const order = await Order.create(makeOrder({ createdBy: adminId }))
      await Payment.create({
        orderId: order._id, type: 'advance', amount: 2000,
        method: 'cash', status: 'completed', collectedBy: adminId, paidAt: new Date(),
      })
      await Payment.create({
        orderId: order._id, type: 'advance', amount: 500,
        method: 'upi', status: 'refunded', collectedBy: adminId, paidAt: new Date(),
      })

      const res = await request(app)
        .get('/api/v1/analytics/overview')
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      expect(res.body.revenue).toBe(2000)
    })
  })

  // ── GET /analytics/orders ─────────────────────────────────────────────────
  describe('GET /api/v1/analytics/orders', () => {
    it('200 — returns byStatus array', async () => {
      await Order.create(makeOrder({ createdBy: adminId, status: 'draft' }))
      await Order.create(makeOrder({ createdBy: adminId, status: 'draft' }))
      await Order.create(makeOrder({ createdBy: adminId, status: 'confirmed' }))

      const res = await request(app)
        .get('/api/v1/analytics/orders')
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      expect(Array.isArray(res.body.byStatus)).toBe(true)

      const draftEntry = res.body.byStatus.find((s: { _id: string }) => s._id === 'draft')
      expect(draftEntry?.count).toBeGreaterThanOrEqual(2)
    })

    it('403 — sub_admin rejected', async () => {
      const res = await request(app)
        .get('/api/v1/analytics/orders')
        .set('Authorization', `Bearer ${subAdminToken}`)
      expect(res.status).toBe(403)
    })
  })

  // ── GET /analytics/revenue ────────────────────────────────────────────────
  describe('GET /api/v1/analytics/revenue', () => {
    it('200 — returns byMethod and total', async () => {
      const order = await Order.create(makeOrder({ createdBy: adminId }))
      await Payment.create({
        orderId: order._id, type: 'advance', amount: 1500,
        method: 'cash', status: 'completed', collectedBy: adminId, paidAt: new Date(),
      })
      await Payment.create({
        orderId: order._id, type: 'advance', amount: 1000,
        method: 'upi', status: 'completed', collectedBy: adminId, paidAt: new Date(),
      })

      const res = await request(app)
        .get('/api/v1/analytics/revenue')
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      expect(Array.isArray(res.body.byMethod)).toBe(true)
      expect(res.body.total).toBeGreaterThanOrEqual(2500)
    })

    it('total=0 when no completed payments', async () => {
      const res = await request(app)
        .get('/api/v1/analytics/revenue')
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      expect(res.body.total).toBe(0)
    })
  })

  // ── GET /analytics/tasks ──────────────────────────────────────────────────
  describe('GET /api/v1/analytics/tasks', () => {
    it('200 — returns byStatus array', async () => {
      const order = await Order.create(makeOrder({ createdBy: adminId }))
      await Task.create({ orderId: order._id, type: 'flex_printing', status: 'done', assignedTo: null })
      await Task.create({ orderId: order._id, type: 'flex_printing', status: 'in_progress', assignedTo: null })

      const res = await request(app)
        .get('/api/v1/analytics/tasks')
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      expect(Array.isArray(res.body.byStatus)).toBe(true)
    })

    it('403 — sub_admin rejected', async () => {
      const res = await request(app)
        .get('/api/v1/analytics/tasks')
        .set('Authorization', `Bearer ${subAdminToken}`)
      expect(res.status).toBe(403)
    })
  })
})
