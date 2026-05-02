import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import { app } from '../../src/app'
import { User } from '../../src/modules/auth/auth.model'
import { Discount } from '../../src/modules/discounts/discount.model'
import { makeUser, makeDiscount } from '../helpers/mock-factory'
import jwt from 'jsonwebtoken'
import { env } from '../../src/config/env'

function signToken(payload: { _id: string; role: string; email: string }) {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: '1h' })
}

describe('Discounts API — Integration', () => {
  let adminToken: string
  let adminId: string

  beforeEach(async () => {
    const admin = await User.create(makeUser({ email: 'admin@poms.com', password: 'password123', role: 'admin' }))
    adminId = admin._id.toString()
    adminToken = signToken({ _id: adminId, role: 'admin', email: 'admin@poms.com' })
  })

  describe('POST /api/v1/discounts', () => {
    it('201 — admin creates a discount', async () => {
      const res = await request(app)
        .post('/api/v1/discounts')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Summer Sale', type: 'percentage', value: 10, scope: 'all' })

      expect(res.status).toBe(201)
      expect(res.body.name).toBe('Summer Sale')
      expect(res.body.value).toBe(10)
    })

    it('403 — staff cannot create discounts', async () => {
      const staff = await User.create(makeUser({ email: 'staff@poms.com', password: 'password123', role: 'helper_staff' }))
      const staffToken = signToken({ _id: staff._id.toString(), role: 'helper_staff', email: 'staff@poms.com' })

      const res = await request(app)
        .post('/api/v1/discounts')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ name: 'Sale', type: 'percentage', value: 10 })

      expect(res.status).toBe(403)
    })
  })

  describe('GET /api/v1/discounts', () => {
    it('200 — returns active discounts', async () => {
      await Discount.create({ ...makeDiscount(), createdBy: adminId })
      await Discount.create({ ...makeDiscount({ name: 'Loyalty', scope: 'loyal' }), createdBy: adminId })

      const res = await request(app)
        .get('/api/v1/discounts')
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      expect(res.body.total).toBe(2)
    })
  })

  describe('PATCH /api/v1/discounts/:id', () => {
    it('200 — updates discount', async () => {
      const discount = await Discount.create({ ...makeDiscount(), createdBy: adminId })

      const res = await request(app)
        .patch(`/api/v1/discounts/${discount._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ value: 20 })

      expect(res.status).toBe(200)
      expect(res.body.value).toBe(20)
    })
  })

  describe('DELETE /api/v1/discounts/:id', () => {
    it('204 — soft-deletes discount', async () => {
      const discount = await Discount.create({ ...makeDiscount(), createdBy: adminId })

      const res = await request(app)
        .delete(`/api/v1/discounts/${discount._id}`)
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(204)

      const check = await Discount.findById(discount._id)
      expect(check?.isActive).toBe(false)
    })
  })
})
