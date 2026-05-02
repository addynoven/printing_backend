import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import { app } from '../../src/app'
import { User } from '../../src/modules/auth/auth.model'
import { ActivityLog } from '../../src/modules/audit/activity-log.model'
import { makeUser } from '../helpers/mock-factory'
import jwt from 'jsonwebtoken'
import { env } from '../../src/config/env'

function signToken(payload: { _id: string; role: string; email: string }) {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: '1h' })
}

describe('Auth API — Integration', () => {
  beforeEach(async () => {
    // Clean users created in this suite
  })

  describe('POST /api/v1/auth/login', () => {
    it('200 — returns token for valid credentials', async () => {
      await User.create(makeUser({ email: 'login@poms.com', password: 'password123', role: 'admin' }))

      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'login@poms.com', password: 'password123' })

      expect(res.status).toBe(200)
      expect(res.body.token).toBeDefined()
      expect(res.body.user).toMatchObject({ email: 'login@poms.com', role: 'admin' })
    })

    it('401 — rejects wrong password', async () => {
      await User.create(makeUser({ email: 'badpass@poms.com', password: 'password123', role: 'admin' }))

      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'badpass@poms.com', password: 'wrongpassword' })

      expect(res.status).toBe(401)
    })

    it('401 — rejects non-existent user', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'nope@poms.com', password: 'password123' })

      expect(res.status).toBe(401)
    })

    it('401 — logs failed login for non-existent user to activity log', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'audit-nope@poms.com', password: 'password123' })

      expect(res.status).toBe(401)

      const log = await ActivityLog.findOne({ 'details.email': 'audit-nope@poms.com' }).lean()
      expect(log).toBeTruthy()
      expect(log!.action).toBe('login')
      expect(log!.resource).toBe('auth')
      expect((log!.details as Record<string, unknown>).success).toBe(false)
      expect(log!.userId).toBeFalsy()
    })
  })

  describe('GET /api/v1/auth/me', () => {
    it('200 — returns current user', async () => {
      const user = await User.create(makeUser({ email: 'me@poms.com', password: 'password123', role: 'admin' }))
      const token = signToken({ _id: user._id.toString(), role: 'admin', email: 'me@poms.com' })

      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${token}`)

      expect(res.status).toBe(200)
      expect(res.body.email).toBe('me@poms.com')
    })

    it('401 — no token', async () => {
      const res = await request(app).get('/api/v1/auth/me')
      expect(res.status).toBe(401)
    })
  })

  describe('RBAC — role matrix on protected routes', () => {
    const ROUTES = [
      { method: 'get' as const, path: '/api/v1/orders', roles: ['super_admin', 'admin', 'sub_admin', 'designer', 'flex_printing_staff', 'helper_staff'] },
      { method: 'post' as const, path: '/api/v1/orders', body: { customer: { name: 'Test', phone: '9999999999' }, jobType: 'flex_printing', items: [{ description: 'X', quantity: 1, unit: 'sqft', unitPrice: 100 }], rawCost: 100, taxableValue: 100, billSplitPct: 40 }, roles: ['super_admin', 'admin', 'sub_admin'] },
      { method: 'get' as const, path: '/api/v1/billing/order/000000000000000000000000', roles: ['super_admin', 'admin', 'sub_admin'] },
      { method: 'get' as const, path: '/api/v1/inventory', roles: ['super_admin', 'admin', 'sub_admin', 'designer', 'flex_printing_staff', 'helper_staff'] },
      { method: 'get' as const, path: '/api/v1/tasks', roles: ['super_admin', 'admin', 'sub_admin', 'designer', 'flex_printing_staff', 'helper_staff'] },
      { method: 'get' as const, path: '/api/v1/attendance', roles: ['super_admin', 'admin', 'sub_admin', 'flex_printing_staff', 'helper_staff'] },
    ]

    for (const route of ROUTES) {
      for (const role of ['super_admin', 'admin', 'sub_admin', 'designer', 'flex_printing_staff', 'helper_staff'] as const) {
        const shouldPass = route.roles.includes(role)
        it(`${route.method.toUpperCase()} ${route.path} → ${shouldPass ? 200 : 403} for ${role}`, async () => {
          const user = await User.create(makeUser({ email: `${role}_${route.path.replace(/\//g, '_')}@poms.com`, password: 'password123', role }))
          const token = signToken({ _id: user._id.toString(), role, email: user.email })

          const req = request(app)[route.method](route.path).set('Authorization', `Bearer ${token}`)
          if (route.body) req.send(route.body)

          const res = await req
          const expected = shouldPass ? [200, 201] : [403]
          expect(expected).toContain(res.status)
        })
      }
    }
  })
})
