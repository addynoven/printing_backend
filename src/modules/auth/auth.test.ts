import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import { app } from '../../app'
import { User } from './auth.model'
import { makeUser } from '../../../tests/helpers/mock-factory'

describe('Auth Module', () => {

  describe('POST /api/v1/auth/login', () => {
    beforeEach(async () => {
      await User.create(makeUser({ email: 'admin@poms.com', password: 'password123', role: 'admin' }))
    })

    it('returns token and user on valid credentials', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'admin@poms.com', password: 'password123' })

      expect(res.status).toBe(200)
      expect(res.body.token).toBeDefined()
      expect(res.body.user.role).toBe('admin')
      expect(res.body.user.password).toBeUndefined() // never expose password
    })

    it('returns 401 for wrong password', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'admin@poms.com', password: 'wrongpassword' })

      expect(res.status).toBe(401)
      expect(res.body).toMatchObject({ error: expect.any(String) })
    })

    it('returns 401 for non-existent email', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'nobody@poms.com', password: 'password123' })

      expect(res.status).toBe(401)
    })

    it('returns 400 for invalid email format', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'not-an-email', password: 'password123' })

      expect(res.status).toBe(400)
    })

    it('returns 401 for inactive user', async () => {
      await User.create(makeUser({ email: 'inactive@poms.com', password: 'password123', isActive: false }))

      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'inactive@poms.com', password: 'password123' })

      expect(res.status).toBe(401)
    })
  })

  describe('GET /api/v1/auth/me', () => {
    it('returns current user for valid token', async () => {
      const user = await User.create(makeUser({ email: 'me@poms.com', password: 'password123' }))

      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'me@poms.com', password: 'password123' })

      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${loginRes.body.token}`)

      expect(res.status).toBe(200)
      expect(res.body._id).toBe(user._id.toString())
      expect(res.body.password).toBeUndefined()
    })

    it('returns 401 with no token', async () => {
      const res = await request(app).get('/api/v1/auth/me')
      expect(res.status).toBe(401)
    })

    it('returns 401 with malformed token', async () => {
      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', 'Bearer not.a.valid.token')

      expect(res.status).toBe(401)
    })
  })

})
