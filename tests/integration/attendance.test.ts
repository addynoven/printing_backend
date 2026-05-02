import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import { app } from '../../src/app'
import { User } from '../../src/modules/auth/auth.model'
import { Attendance } from '../../src/modules/attendance/attendance.model'
import { makeUser } from '../helpers/mock-factory'
import jwt from 'jsonwebtoken'
import { env } from '../../src/config/env'

function signToken(payload: { _id: string; role: string; email: string }) {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: '1h' })
}

describe('Attendance API — Integration', () => {
  let adminToken: string
  let adminId: string
  let staffToken: string
  let staffId: string

  beforeEach(async () => {
    const admin = await User.create(makeUser({ email: 'admin@poms.com', password: 'password123', role: 'admin' }))
    adminId = admin._id.toString()
    adminToken = signToken({ _id: adminId, role: 'admin', email: 'admin@poms.com' })

    const staff = await User.create(makeUser({ email: 'staff@poms.com', password: 'password123', role: 'helper_staff' }))
    staffId = staff._id.toString()
    staffToken = signToken({ _id: staffId, role: 'helper_staff', email: 'staff@poms.com' })
  })

  describe('POST /api/v1/attendance/check-in', () => {
    it('201 — staff checks in', async () => {
      const res = await request(app)
        .post('/api/v1/attendance/check-in')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ checkIn: '2024-01-15T08:00:00.000Z' })

      expect(res.status).toBe(201)
      expect(res.body.userId).toBe(staffId)
      expect(res.body.status).toBe('present')
    })

    it('409 — cannot check in twice same day', async () => {
      await request(app)
        .post('/api/v1/attendance/check-in')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ checkIn: '2024-01-15T08:00:00.000Z' })

      const res = await request(app)
        .post('/api/v1/attendance/check-in')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ checkIn: '2024-01-15T08:00:00.000Z' })

      expect(res.status).toBe(409)
    })
  })

  describe('POST /api/v1/attendance/check-out', () => {
    it('200 — staff checks out', async () => {
      const today = new Date('2024-01-15T00:00:00.000Z')
      await Attendance.create({ userId: staffId, date: today, checkIn: new Date('2024-01-15T08:00:00.000Z'), status: 'present' })

      const res = await request(app)
        .post('/api/v1/attendance/check-out')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ checkOut: '2024-01-15T18:00:00.000Z' })

      expect(res.status).toBe(200)
      expect(res.body.checkOut).toBeDefined()
    })

    it('404 — cannot check out without check-in', async () => {
      const res = await request(app)
        .post('/api/v1/attendance/check-out')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ checkOut: '2024-01-15T18:00:00.000Z' })

      expect(res.status).toBe(404)
    })
  })

  describe('GET /api/v1/attendance', () => {
    it('200 — admin lists attendance records', async () => {
      const today = new Date('2024-01-15T00:00:00.000Z')
      await Attendance.create({ userId: staffId, date: today, checkIn: new Date('2024-01-15T08:00:00.000Z'), status: 'present' })

      const res = await request(app)
        .get('/api/v1/attendance')
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      expect(res.body.total).toBe(1)
    })
  })

  describe('GET /api/v1/attendance/stats/:userId', () => {
    it('200 — returns productivity stats', async () => {
      const today = new Date('2024-01-15T00:00:00.000Z')
      await Attendance.create({ userId: staffId, date: today, checkIn: new Date('2024-01-15T08:00:00.000Z'), status: 'present', lateMinutes: 10, overtimeMinutes: 30, shiftDurationMinutes: 510 })

      const res = await request(app)
        .get(`/api/v1/attendance/stats/${staffId}`)
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      expect(res.body.totalDays).toBe(1)
      expect(res.body.presentDays).toBe(1)
    })
  })
})
