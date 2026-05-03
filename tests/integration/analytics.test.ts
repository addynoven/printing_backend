import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import { app } from '../../src/app'
import { User } from '../../src/modules/auth/auth.model'
import { Order } from '../../src/modules/orders/order.model'
import { Task } from '../../src/modules/tasks/task.model'
import { Material } from '../../src/modules/inventory/material.model'
import { Machine } from '../../src/modules/machines/machine.model'
import { Payment } from '../../src/modules/payments/payment.model'
import {
  makeUser,
  makeOrder,
  makeMachine,
  makeMaterial,
  makeTask,
  makePayment,
} from '../helpers/mock-factory'

function paymentDoc(overrides: Parameters<typeof makePayment>[0] = {}) {
  const { _id: _ignore, ...rest } = makePayment(overrides)
  return rest
}
import jwt from 'jsonwebtoken'
import { env } from '../../src/config/env'

function signToken(payload: { _id: string; role: string; email: string }) {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: '1h' })
}

describe('Analytics API — Integration', () => {
  let adminToken: string
  let adminId:    string

  beforeEach(async () => {
    const admin = await User.create(makeUser({ email: 'admin@poms.com', password: 'password123', role: 'admin' }))
    adminId    = admin._id.toString()
    adminToken = signToken({ _id: adminId, role: 'admin', email: 'admin@poms.com' })
  })

  // ── /overview ──────────────────────────────────────────────────────────────
  describe('GET /api/v1/analytics/overview', () => {
    it('returns 200 with summary fields', async () => {
      await Order.create({ ...makeOrder(),                             createdBy: adminId })
      await Order.create({ ...makeOrder(), status: 'confirmed',        createdBy: adminId })
      await Material.create(makeMaterial({ stock: 5, threshold: 10 }))
      await Machine.create(makeMachine({ status: 'active' }))
      await Payment.create(paymentDoc({ collectedBy: adminId, orderId: '000000000000000000000001' }))

      const res = await request(app)
        .get('/api/v1/analytics/overview')
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      expect(res.body).toHaveProperty('totalOrders', 2)
      expect(res.body).toHaveProperty('statusBreakdown')
      expect(res.body).toHaveProperty('lowStockCount', 1)
      expect(res.body).toHaveProperty('activeMachines', 1)
      expect(res.body).toHaveProperty('revenue')
    })

    it('returns 401 with no token', async () => {
      const res = await request(app).get('/api/v1/analytics/overview')
      expect(res.status).toBe(401)
    })

    it('returns 403 for sub_admin (no analytics permission)', async () => {
      const sub = await User.create(makeUser({ email: 'sub@poms.com', password: 'password123', role: 'sub_admin' }))
      const token = signToken({ _id: sub._id.toString(), role: 'sub_admin', email: 'sub@poms.com' })

      const res = await request(app)
        .get('/api/v1/analytics/overview')
        .set('Authorization', `Bearer ${token}`)

      expect(res.status).toBe(403)
    })
  })

  // ── /orders ────────────────────────────────────────────────────────────────
  describe('GET /api/v1/analytics/orders', () => {
    it('returns aggregated counts by status / jobType / priority', async () => {
      await Order.create({ ...makeOrder(),                                                     createdBy: adminId })
      await Order.create({ ...makeOrder({ priority: 'urgent' }), status: 'confirmed',          createdBy: adminId })

      const res = await request(app)
        .get('/api/v1/analytics/orders')
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      expect(Array.isArray(res.body.byStatus)).toBe(true)
      expect(Array.isArray(res.body.byJobType)).toBe(true)
      expect(Array.isArray(res.body.byPriority)).toBe(true)
      expect(Array.isArray(res.body.daily)).toBe(true)
    })
  })

  // ── /revenue ───────────────────────────────────────────────────────────────
  describe('GET /api/v1/analytics/revenue', () => {
    it('sums completed payments and groups by method/type', async () => {
      await Payment.create(paymentDoc({
        collectedBy: adminId,
        orderId:     '000000000000000000000001',
        amount:      500,
        method:      'cash',
        type:        'advance',
      }))
      await Payment.create(paymentDoc({
        collectedBy: adminId,
        orderId:     '000000000000000000000002',
        amount:      1500,
        method:      'upi',
        type:        'final',
      }))

      const res = await request(app)
        .get('/api/v1/analytics/revenue')
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      expect(res.body.total).toBe(2000)
      expect(res.body.byMethod.length).toBeGreaterThan(0)
      expect(res.body.byType.length).toBeGreaterThan(0)
    })
  })

  // ── /inventory ─────────────────────────────────────────────────────────────
  describe('GET /api/v1/analytics/inventory', () => {
    it('reports total inventory value, count, and low-stock list', async () => {
      await Material.create(makeMaterial({ name: 'A', stock: 100, threshold: 10, costPerUnit: 5 }))
      await Material.create(makeMaterial({ name: 'B', stock: 5,   threshold: 10, costPerUnit: 8 }))

      const res = await request(app)
        .get('/api/v1/analytics/inventory')
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      expect(res.body.totalMaterials).toBe(2)
      expect(res.body.lowStockCount).toBe(1)
      expect(res.body.totalValue).toBe(100 * 5 + 5 * 8)
    })
  })

  // ── /tasks ─────────────────────────────────────────────────────────────────
  describe('GET /api/v1/analytics/tasks', () => {
    it('returns task counts by status and type', async () => {
      const order = await Order.create({ ...makeOrder(), createdBy: adminId })
      await Task.create({ ...makeTask({ orderId: order._id.toString(), assignedTo: null }) })

      const res = await request(app)
        .get('/api/v1/analytics/tasks')
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      expect(Array.isArray(res.body.byStatus)).toBe(true)
      expect(Array.isArray(res.body.byType)).toBe(true)
      expect(res.body).toHaveProperty('avgCompletionMins')
      expect(res.body).toHaveProperty('totalCompleted')
      expect(Array.isArray(res.body.topPerformers)).toBe(true)
    })
  })

  // ── /machines ──────────────────────────────────────────────────────────────
  describe('GET /api/v1/analytics/machines', () => {
    it('returns machine counts by status / type / department', async () => {
      await Machine.create(makeMachine({ name: 'M1', status: 'active' }))
      await Machine.create(makeMachine({ name: 'M2', status: 'maintenance', type: 'laser_cutter', department: 'Cutting' }))

      const res = await request(app)
        .get('/api/v1/analytics/machines')
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      expect(res.body.total).toBe(2)
      expect(Array.isArray(res.body.byStatus)).toBe(true)
      expect(Array.isArray(res.body.byType)).toBe(true)
      expect(Array.isArray(res.body.byDepartment)).toBe(true)
    })
  })
})
