import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import { app } from '../../src/app'
import { User } from '../../src/modules/auth/auth.model'
import { Customer } from '../../src/modules/customers/customer.model'
import { Order } from '../../src/modules/orders/order.model'
import { makeUser, makeCustomer, makeOrder } from '../helpers/mock-factory'
import jwt from 'jsonwebtoken'
import { env } from '../../src/config/env'

function signToken(payload: { _id: string; role: string; email: string }) {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: '1h' })
}

describe('Customers API — Integration', () => {
  let adminToken: string
  let adminId: string

  beforeEach(async () => {
    const admin = await User.create(makeUser({ email: 'admin@poms.com', password: 'password123', role: 'admin' }))
    adminId = admin._id.toString()
    adminToken = signToken({ _id: adminId, role: 'admin', email: 'admin@poms.com' })
  })

  describe('POST /api/v1/customers', () => {
    it('201 — creates a customer', async () => {
      const res = await request(app)
        .post('/api/v1/customers')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Alice', phone: '9876543210', email: 'alice@test.com' })

      expect(res.status).toBe(201)
      expect(res.body.phone).toBe('9876543210')
      expect(res.body.loyaltyTier).toBe('bronze')
    })

    it('409 — duplicate phone rejected', async () => {
      await Customer.create(makeCustomer({ phone: '9876543210' }))

      const res = await request(app)
        .post('/api/v1/customers')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Alice', phone: '9876543210' })

      expect(res.status).toBe(409)
    })
  })

  describe('GET /api/v1/customers', () => {
    it('200 — lists customers with search', async () => {
      await Customer.create(makeCustomer({ name: 'Alice', phone: '1111111111' }))
      await Customer.create(makeCustomer({ name: 'Bob', phone: '2222222222' }))

      const res = await request(app)
        .get('/api/v1/customers?search=Alice')
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      expect(res.body.total).toBe(1)
      expect(res.body.customers[0].name).toBe('Alice')
    })
  })

  describe('GET /api/v1/customers/phone/:phone', () => {
    it('200 — finds customer by phone', async () => {
      await Customer.create(makeCustomer({ phone: '7777777777' }))

      const res = await request(app)
        .get('/api/v1/customers/phone/7777777777')
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      expect(res.body.phone).toBe('7777777777')
    })
  })

  describe('GET /api/v1/customers/:id/orders', () => {
    it('200 — returns customer orders', async () => {
      const customer = await Customer.create(makeCustomer({ phone: '5555555555' }))
      await Order.create({ ...makeOrder({ customer: { name: 'Test', phone: '5555555555', email: '' } }), createdBy: adminId })

      const res = await request(app)
        .get(`/api/v1/customers/${customer._id}/orders`)
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      expect(res.body.total).toBe(1)
    })
  })
})
