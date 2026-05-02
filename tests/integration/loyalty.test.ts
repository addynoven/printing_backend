import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import { app } from '../../src/app'
import { User } from '../../src/modules/auth/auth.model'
import { Customer } from '../../src/modules/customers/customer.model'
import { Coupon } from '../../src/modules/loyalty/coupon.model'
import { LoyaltyTierConfig } from '../../src/modules/loyalty/loyalty-tier.model'
import { makeUser, makeCustomer, makeCoupon } from '../helpers/mock-factory'
import jwt from 'jsonwebtoken'
import { env } from '../../src/config/env'

function signToken(payload: { _id: string; role: string; email: string }) {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: '1h' })
}

describe('Loyalty API — Integration', () => {
  let adminToken: string
  let adminId: string

  beforeEach(async () => {
    const admin = await User.create(makeUser({ email: 'admin@poms.com', password: 'password123', role: 'admin' }))
    adminId = admin._id.toString()
    adminToken = signToken({ _id: adminId, role: 'admin', email: 'admin@poms.com' })
  })

  describe('PUT /api/v1/loyalty/tiers/:tier', () => {
    it('200 — admin configures tier', async () => {
      const res = await request(app)
        .put('/api/v1/loyalty/tiers/silver')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ minSpend: 10000, minVisits: 5, discountPct: 5 })

      expect(res.status).toBe(200)
      expect(res.body.tier).toBe('silver')
      expect(res.body.minSpend).toBe(10000)
    })
  })

  describe('POST /api/v1/loyalty/coupons', () => {
    it('201 — creates a coupon', async () => {
      const customer = await Customer.create(makeCustomer())

      const res = await request(app)
        .post('/api/v1/loyalty/coupons')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ code: 'SAVE20', customerId: customer._id.toString(), type: 'percentage', value: 20, expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() })

      expect(res.status).toBe(201)
      expect(res.body.code).toBe('SAVE20')
    })
  })

  describe('GET /api/v1/loyalty/customers/:customerId/summary', () => {
    it('200 — returns loyalty summary', async () => {
      const customer = await Customer.create(makeCustomer({ loyaltyTier: 'gold' }))
      await LoyaltyTierConfig.create({ tier: 'gold', minSpend: 25000, minVisits: 10, discountPct: 10 })

      const res = await request(app)
        .get(`/api/v1/loyalty/customers/${customer._id}/summary`)
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      expect(res.body.customer.loyaltyTier).toBe('gold')
      expect(res.body.tier.discountPct).toBe(10)
    })
  })

  describe('GET /api/v1/loyalty/coupons', () => {
    it('200 — lists coupons', async () => {
      const customer = await Customer.create(makeCustomer())
      await Coupon.create({ ...makeCoupon(), customerId: customer._id })

      const res = await request(app)
        .get('/api/v1/loyalty/coupons')
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      expect(res.body.total).toBe(1)
    })
  })
})
