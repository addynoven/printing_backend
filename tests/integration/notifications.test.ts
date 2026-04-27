import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import { app } from '../../src/app'
import { User } from '../../src/modules/auth/auth.model'
import { Notification } from '../../src/modules/notifications/notification.model'
import { makeUser, makeNotification } from '../helpers/mock-factory'
import jwt from 'jsonwebtoken'
import { env } from '../../src/config/env'
import { Types } from 'mongoose'

function signToken(payload: { _id: string; role: string; email: string }) {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: '1h' })
}

describe('Notifications API — Integration', () => {
  let userAToken: string
  let userAId:    string
  let userBToken: string
  let userBId:    string
  let notifAId:   string   // notification belonging to user A

  beforeEach(async () => {
    // User A — designer
    const userA = await User.create(
      makeUser({ email: 'designer@poms.test', password: 'password123', role: 'designer' })
    )
    userAId    = userA._id.toString()
    userAToken = signToken({ _id: userAId, role: 'designer', email: 'designer@poms.test' })

    // User B — admin
    const userB = await User.create(
      makeUser({ email: 'admin@poms.test', password: 'password123', role: 'admin' })
    )
    userBId    = userB._id.toString()
    userBToken = signToken({ _id: userBId, role: 'admin', email: 'admin@poms.test' })

    // Create 2 notifications for user A (one read, one unread)
    const [n1] = await Notification.create([
      {
        userId:  new Types.ObjectId(userAId),
        type:    'task_assigned',
        title:   'Task Assigned',
        message: 'You have a new task.',
        read:    false,
      },
      {
        userId:  new Types.ObjectId(userAId),
        type:    'order_completed',
        title:   'Order Done',
        message: 'Order has been completed.',
        read:    true,
      },
    ])
    notifAId = n1._id.toString()
  })

  // ─────────────────────────────────────────────
  // GET /api/v1/notifications/unread-count
  // ─────────────────────────────────────────────
  describe('GET /api/v1/notifications/unread-count', () => {
    it('200 returns { count } for own unread notifications', async () => {
      const res = await request(app)
        .get('/api/v1/notifications/unread-count')
        .set('Authorization', `Bearer ${userAToken}`)

      expect(res.status).toBe(200)
      expect(typeof res.body.count).toBe('number')
      // user A has 1 unread — will fail RED until service is implemented
      expect(res.body.count).toBe(1)
    })

    it('401 when no token provided', async () => {
      const res = await request(app).get('/api/v1/notifications/unread-count')
      expect(res.status).toBe(401)
    })
  })

  // ─────────────────────────────────────────────
  // GET /api/v1/notifications
  // ─────────────────────────────────────────────
  describe('GET /api/v1/notifications', () => {
    it('200 returns own notifications only', async () => {
      const res = await request(app)
        .get('/api/v1/notifications')
        .set('Authorization', `Bearer ${userAToken}`)

      expect(res.status).toBe(200)
      expect(Array.isArray(res.body.notifications)).toBe(true)
      // user A has 2 notifications — will fail RED until service is implemented
      expect(res.body.total).toBe(2)
      res.body.notifications.forEach((n: { userId: string }) => {
        expect(n.userId).toBe(userAId)
      })
    })

    it('401 when no token provided', async () => {
      const res = await request(app).get('/api/v1/notifications')
      expect(res.status).toBe(401)
    })
  })

  // ─────────────────────────────────────────────
  // PATCH /api/v1/notifications/read-all
  // ─────────────────────────────────────────────
  describe('PATCH /api/v1/notifications/read-all', () => {
    it('204 marks all own notifications as read', async () => {
      const res = await request(app)
        .patch('/api/v1/notifications/read-all')
        .set('Authorization', `Bearer ${userAToken}`)

      // will fail RED until service is implemented
      expect(res.status).toBe(204)

      // Verify in DB that user A's notifications are all read
      const remaining = await Notification.find({
        userId: new Types.ObjectId(userAId),
        read:   false,
      })
      expect(remaining).toHaveLength(0)
    })

    it('401 when no token provided', async () => {
      const res = await request(app).patch('/api/v1/notifications/read-all')
      expect(res.status).toBe(401)
    })
  })

  // ─────────────────────────────────────────────
  // PATCH /api/v1/notifications/:id/read
  // ─────────────────────────────────────────────
  describe('PATCH /api/v1/notifications/:id/read', () => {
    it('200 marks specific notification as read', async () => {
      const res = await request(app)
        .patch(`/api/v1/notifications/${notifAId}/read`)
        .set('Authorization', `Bearer ${userAToken}`)

      // will fail RED until service is implemented
      expect(res.status).toBe(200)
      expect(res.body.read).toBe(true)
      expect(res.body._id).toBe(notifAId)
    })

    it('400 for malformed ObjectId', async () => {
      const res = await request(app)
        .patch('/api/v1/notifications/not-a-valid-id/read')
        .set('Authorization', `Bearer ${userAToken}`)

      expect(res.status).toBe(400)
    })

    it('404 when notification does not exist', async () => {
      const fakeId = '000000000000000000000099'

      const res = await request(app)
        .patch(`/api/v1/notifications/${fakeId}/read`)
        .set('Authorization', `Bearer ${userAToken}`)

      // will fail RED until service is implemented
      expect(res.status).toBe(404)
    })

    it('404 when notification belongs to a different user', async () => {
      // user B tries to mark user A's notification as read
      const res = await request(app)
        .patch(`/api/v1/notifications/${notifAId}/read`)
        .set('Authorization', `Bearer ${userBToken}`)

      // will fail RED until service is implemented
      expect(res.status).toBe(404)
    })

    it('401 when no token provided', async () => {
      const res = await request(app).patch(`/api/v1/notifications/${notifAId}/read`)
      expect(res.status).toBe(401)
    })
  })

  // ─────────────────────────────────────────────
  // Isolation — user B cannot see or act on user A's notifications
  // ─────────────────────────────────────────────
  describe('Isolation — User B cannot access User A notifications', () => {
    it('GET / returns empty list for user B (has no notifications)', async () => {
      const res = await request(app)
        .get('/api/v1/notifications')
        .set('Authorization', `Bearer ${userBToken}`)

      // will fail RED until service is implemented
      expect(res.status).toBe(200)
      expect(res.body.total).toBe(0)
      expect(res.body.notifications).toHaveLength(0)
    })

    it('GET /unread-count returns 0 for user B', async () => {
      const res = await request(app)
        .get('/api/v1/notifications/unread-count')
        .set('Authorization', `Bearer ${userBToken}`)

      // will fail RED until service is implemented
      expect(res.status).toBe(200)
      expect(res.body.count).toBe(0)
    })

    it('PATCH /:id/read returns 404 when user B tries to mark user A notification', async () => {
      const res = await request(app)
        .patch(`/api/v1/notifications/${notifAId}/read`)
        .set('Authorization', `Bearer ${userBToken}`)

      // will fail RED until service is implemented
      expect(res.status).toBe(404)
    })
  })
})
