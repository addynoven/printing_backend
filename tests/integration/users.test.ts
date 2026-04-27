import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import { app } from '../../src/app'
import { User } from '../../src/modules/auth/auth.model'
import { makeUser } from '../helpers/mock-factory'
import jwt from 'jsonwebtoken'
import { env } from '../../src/config/env'

// Build a signed JWT without hitting the login endpoint
function signToken(payload: { _id: string; role: string; email: string }) {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: '1h' })
}

describe('Users API — Integration', () => {
  let adminToken: string
  let adminId: string

  beforeEach(async () => {
    const admin = await User.create(makeUser({ email: 'admin@poms.com', password: 'password123', role: 'admin' }))
    adminId = admin._id.toString()
    adminToken = signToken({ _id: adminId, role: 'admin', email: 'admin@poms.com' })
  })

  // ──────────────────────────────────────────────
  // GET /api/v1/users
  // ──────────────────────────────────────────────
  describe('GET /api/v1/users', () => {
    it('returns 200 with users array and total', async () => {
      const res = await request(app)
        .get('/api/v1/users')
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      expect(Array.isArray(res.body.users)).toBe(true)
      expect(typeof res.body.total).toBe('number')
      expect(res.body.total).toBe(1)
    })

    it('never returns password in response', async () => {
      const res = await request(app)
        .get('/api/v1/users')
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      res.body.users.forEach((u: Record<string, unknown>) => {
        expect(u.password).toBeUndefined()
      })
    })

    it('filters by role', async () => {
      await User.create(makeUser({ email: 'designer@poms.com', role: 'designer', password: 'password123' }))

      const res = await request(app)
        .get('/api/v1/users?role=designer')
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      expect(res.body.total).toBe(1)
      expect(res.body.users[0].role).toBe('designer')
    })

    it('filters by isAvailable', async () => {
      await User.create(makeUser({ email: 'busy@poms.com', role: 'designer', password: 'pw12345678', isAvailable: false }))

      const res = await request(app)
        .get('/api/v1/users?isAvailable=false')
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      res.body.users.forEach((u: Record<string, unknown>) => {
        expect(u.isAvailable).toBe(false)
      })
    })

    it('only returns active users by default (excludes soft-deleted)', async () => {
      await User.create(makeUser({ email: 'deleted@poms.com', password: 'password123', isActive: false }))

      const res = await request(app)
        .get('/api/v1/users')
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      const emails = res.body.users.map((u: { email: string }) => u.email)
      expect(emails).not.toContain('deleted@poms.com')
    })

    it('returns 401 with no token', async () => {
      const res = await request(app).get('/api/v1/users')
      expect(res.status).toBe(401)
    })
  })

  // ──────────────────────────────────────────────
  // POST /api/v1/users
  // ──────────────────────────────────────────────
  describe('POST /api/v1/users', () => {
    it('creates a user and returns 201 without password', async () => {
      const payload = { name: 'New Staff', email: 'staff@poms.com', password: 'securepass', role: 'designer' }

      const res = await request(app)
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(payload)

      expect(res.status).toBe(201)
      expect(res.body.email).toBe('staff@poms.com')
      expect(res.body.role).toBe('designer')
      expect(res.body.password).toBeUndefined()
    })

    it('returns 409 on duplicate email', async () => {
      const payload = { name: 'Dup User', email: 'admin@poms.com', password: 'securepass', role: 'designer' }

      const res = await request(app)
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(payload)

      expect(res.status).toBe(409)
      expect(res.body).toMatchObject({ error: expect.any(String) })
    })

    it('returns 400 for invalid role', async () => {
      const payload = { name: 'Bad Role', email: 'bad@poms.com', password: 'securepass', role: 'not_a_role' }

      const res = await request(app)
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(payload)

      expect(res.status).toBe(400)
    })

    it('returns 400 when name is too short', async () => {
      const payload = { name: 'A', email: 'short@poms.com', password: 'securepass', role: 'designer' }

      const res = await request(app)
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(payload)

      expect(res.status).toBe(400)
    })

    it('returns 400 when password is too short', async () => {
      const payload = { name: 'Short Pass', email: 'sp@poms.com', password: 'short', role: 'designer' }

      const res = await request(app)
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(payload)

      expect(res.status).toBe(400)
    })
  })

  // ──────────────────────────────────────────────
  // GET /api/v1/users/:id
  // ──────────────────────────────────────────────
  describe('GET /api/v1/users/:id', () => {
    it('returns 200 with user data, no password', async () => {
      const res = await request(app)
        .get(`/api/v1/users/${adminId}`)
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      expect(res.body._id).toBe(adminId)
      expect(res.body.password).toBeUndefined()
    })

    it('returns 404 for non-existent id', async () => {
      const fakeId = '000000000000000000000001'

      const res = await request(app)
        .get(`/api/v1/users/${fakeId}`)
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(404)
      expect(res.body).toMatchObject({ error: expect.any(String) })
    })

    it('returns 400 for malformed ObjectId', async () => {
      const res = await request(app)
        .get('/api/v1/users/not-a-valid-id')
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(400)
    })
  })

  // ──────────────────────────────────────────────
  // PATCH /api/v1/users/:id
  // ──────────────────────────────────────────────
  describe('PATCH /api/v1/users/:id', () => {
    it('updates user name and returns updated data', async () => {
      const res = await request(app)
        .patch(`/api/v1/users/${adminId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Updated Admin' })

      expect(res.status).toBe(200)
      expect(res.body.name).toBe('Updated Admin')
      expect(res.body.password).toBeUndefined()
    })

    it('returns 404 for non-existent user', async () => {
      const fakeId = '000000000000000000000001'

      const res = await request(app)
        .patch(`/api/v1/users/${fakeId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Ghost' })

      expect(res.status).toBe(404)
    })

    it('returns 409 when patching email to one that already exists', async () => {
      const other = await User.create(makeUser({ email: 'taken@poms.com', password: 'password123', role: 'designer' }))

      const res = await request(app)
        .patch(`/api/v1/users/${other._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ email: 'admin@poms.com' })

      expect(res.status).toBe(409)
    })

    it('returns 400 for malformed ObjectId', async () => {
      const res = await request(app)
        .patch('/api/v1/users/not-a-valid-id')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'X' })

      expect(res.status).toBe(400)
    })
  })

  // ──────────────────────────────────────────────
  // DELETE /api/v1/users/:id
  // ──────────────────────────────────────────────
  describe('DELETE /api/v1/users/:id', () => {
    it('returns 204 on soft delete', async () => {
      // super_admin token needed for delete
      const sa = await User.create(makeUser({ email: 'sa@poms.com', password: 'password123', role: 'super_admin' }))
      const saToken = signToken({ _id: sa._id.toString(), role: 'super_admin', email: 'sa@poms.com' })

      const res = await request(app)
        .delete(`/api/v1/users/${adminId}`)
        .set('Authorization', `Bearer ${saToken}`)

      expect(res.status).toBe(204)

      // Confirm user is soft-deleted (isActive=false) not hard-deleted
      const stillExists = await User.findById(adminId)
      expect(stillExists).not.toBeNull()
      expect(stillExists!.isActive).toBe(false)
    })

    it('returns 403 when admin (not super_admin) tries to delete', async () => {
      const res = await request(app)
        .delete(`/api/v1/users/${adminId}`)
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(403)
    })
  })

  // ──────────────────────────────────────────────
  // Role-based access — staff gets 403 on all user routes
  // ──────────────────────────────────────────────
  describe('RBAC — staff role blocked from /users', () => {
    let staffToken: string

    beforeEach(async () => {
      const staff = await User.create(makeUser({ email: 'designer@poms.com', password: 'password123', role: 'designer' }))
      staffToken = signToken({ _id: staff._id.toString(), role: 'designer', email: 'designer@poms.com' })
    })

    it('GET / returns 403 for staff', async () => {
      const res = await request(app).get('/api/v1/users').set('Authorization', `Bearer ${staffToken}`)
      expect(res.status).toBe(403)
    })

    it('POST / returns 403 for staff', async () => {
      const res = await request(app)
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ name: 'New Person', email: 'new@poms.com', password: 'securepass', role: 'designer' })
      expect(res.status).toBe(403)
    })

    it('PATCH /:id returns 403 for staff', async () => {
      const res = await request(app)
        .patch(`/api/v1/users/${adminId}`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ name: 'Hacked' })
      expect(res.status).toBe(403)
    })

    it('DELETE /:id returns 403 for staff', async () => {
      const res = await request(app)
        .delete(`/api/v1/users/${adminId}`)
        .set('Authorization', `Bearer ${staffToken}`)
      expect(res.status).toBe(403)
    })
  })

  // ──────────────────────────────────────────────
  // PATCH /api/v1/users/:id/availability
  // ──────────────────────────────────────────────
  describe('PATCH /api/v1/users/:id/availability', () => {
    it('toggles isAvailable from true to false', async () => {
      const res = await request(app)
        .patch(`/api/v1/users/${adminId}/availability`)
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      expect(res.body.isAvailable).toBe(false)
    })

    it('toggles isAvailable back to true', async () => {
      // Set to false first
      const unavail = await User.create(makeUser({ email: 'unavail@poms.com', password: 'password123', role: 'admin', isAvailable: false }))
      const token = signToken({ _id: unavail._id.toString(), role: 'admin', email: 'unavail@poms.com' })

      const res = await request(app)
        .patch(`/api/v1/users/${unavail._id}/availability`)
        .set('Authorization', `Bearer ${token}`)

      expect(res.status).toBe(200)
      expect(res.body.isAvailable).toBe(true)
    })
  })
})
