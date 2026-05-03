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

  // ── PATCH /api/v1/auth/password ─────────────────────────────────────────
  describe('PATCH /api/v1/auth/password', () => {
    it('200 — changes the password and lets the user log in with the new one', async () => {
      const user  = await User.create(makeUser({ email: 'pwch@poms.com', password: 'oldpassword', role: 'admin' }))
      const token = signToken({ _id: user._id.toString(), role: 'admin', email: 'pwch@poms.com' })

      const res = await request(app)
        .patch('/api/v1/auth/password')
        .set('Authorization', `Bearer ${token}`)
        .send({ currentPassword: 'oldpassword', newPassword: 'newpassword' })

      expect(res.status).toBe(200)

      const loginNew = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'pwch@poms.com', password: 'newpassword' })
      expect(loginNew.status).toBe(200)

      const loginOld = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'pwch@poms.com', password: 'oldpassword' })
      expect(loginOld.status).toBe(401)
    })

    it('401 — wrong current password is rejected', async () => {
      const user  = await User.create(makeUser({ email: 'pwch2@poms.com', password: 'oldpassword', role: 'admin' }))
      const token = signToken({ _id: user._id.toString(), role: 'admin', email: 'pwch2@poms.com' })

      const res = await request(app)
        .patch('/api/v1/auth/password')
        .set('Authorization', `Bearer ${token}`)
        .send({ currentPassword: 'wrongpass', newPassword: 'newpassword' })

      expect(res.status).toBe(401)
    })

    it('400 — new password shorter than 8 chars is rejected', async () => {
      const user  = await User.create(makeUser({ email: 'pwch3@poms.com', password: 'oldpassword', role: 'admin' }))
      const token = signToken({ _id: user._id.toString(), role: 'admin', email: 'pwch3@poms.com' })

      const res = await request(app)
        .patch('/api/v1/auth/password')
        .set('Authorization', `Bearer ${token}`)
        .send({ currentPassword: 'oldpassword', newPassword: 'short' })

      expect(res.status).toBe(400)
    })

    it('401 — no token rejects', async () => {
      const res = await request(app)
        .patch('/api/v1/auth/password')
        .send({ currentPassword: 'whatever', newPassword: 'newpassword' })

      expect(res.status).toBe(401)
    })
  })

  // ── POST /api/v1/auth/forgot-password ───────────────────────────────────
  describe('POST /api/v1/auth/forgot-password', () => {
    it('200 — returns generic message for known email and includes reset token in non-prod', async () => {
      await User.create(makeUser({ email: 'fp@poms.com', password: 'password123', role: 'admin' }))

      const res = await request(app)
        .post('/api/v1/auth/forgot-password')
        .send({ email: 'fp@poms.com' })

      expect(res.status).toBe(200)
      expect(res.body.message).toMatch(/reset link/i)
      expect(typeof res.body.resetToken).toBe('string')
      expect(res.body.resetToken.length).toBeGreaterThan(20)
    })

    it('200 — returns the same generic message for unknown email (no enumeration)', async () => {
      const res = await request(app)
        .post('/api/v1/auth/forgot-password')
        .send({ email: 'unknown@poms.com' })

      expect(res.status).toBe(200)
      expect(res.body.message).toMatch(/reset link/i)
      expect(res.body.resetToken).toBeUndefined()
    })

    it('400 — invalid email format is rejected', async () => {
      const res = await request(app)
        .post('/api/v1/auth/forgot-password')
        .send({ email: 'not-an-email' })

      expect(res.status).toBe(400)
    })
  })

  // ── POST /api/v1/auth/reset-password ────────────────────────────────────
  describe('POST /api/v1/auth/reset-password', () => {
    it('200 — resets password with a valid token and lets user log in with new password', async () => {
      await User.create(makeUser({ email: 'rp@poms.com', password: 'oldpassword', role: 'admin' }))

      const forgot = await request(app)
        .post('/api/v1/auth/forgot-password')
        .send({ email: 'rp@poms.com' })
      const token = forgot.body.resetToken
      expect(typeof token).toBe('string')

      const res = await request(app)
        .post('/api/v1/auth/reset-password')
        .send({ token, newPassword: 'brandnewpw' })

      expect(res.status).toBe(200)

      const loginNew = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'rp@poms.com', password: 'brandnewpw' })
      expect(loginNew.status).toBe(200)
    })

    it('401 — invalid token is rejected', async () => {
      const res = await request(app)
        .post('/api/v1/auth/reset-password')
        .send({ token: 'totally-bogus-token', newPassword: 'brandnewpw' })

      expect(res.status).toBe(401)
    })

    it('401 — token cannot be reused after success', async () => {
      await User.create(makeUser({ email: 'rp2@poms.com', password: 'oldpassword', role: 'admin' }))

      const forgot = await request(app)
        .post('/api/v1/auth/forgot-password')
        .send({ email: 'rp2@poms.com' })
      const token = forgot.body.resetToken

      const first = await request(app)
        .post('/api/v1/auth/reset-password')
        .send({ token, newPassword: 'firstnewpw' })
      expect(first.status).toBe(200)

      const reuse = await request(app)
        .post('/api/v1/auth/reset-password')
        .send({ token, newPassword: 'secondtry' })
      expect(reuse.status).toBe(401)
    })

    it('400 — newPassword shorter than 8 chars is rejected', async () => {
      const res = await request(app)
        .post('/api/v1/auth/reset-password')
        .send({ token: 'whatever', newPassword: 'short' })

      expect(res.status).toBe(400)
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
