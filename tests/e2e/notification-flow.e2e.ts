/**
 * E2E: Notification Flow
 *
 * Verifies the complete notification lifecycle:
 *   Create → appear in list → unread count rises → mark one read →
 *   count falls → mark all read → count = 0
 *
 * Also checks user isolation: User B cannot see or act on User A's notifications.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { Notification } from '../../src/modules/notifications/notification.model'
import { app, request, auth, seedUser } from './helpers'

async function createNotification(userId: string, title = 'Alert') {
  return await Notification.create({
    userId,
    type:    'task_assigned',
    title,
    message: `Message for ${title}`,
    read:    false,
  })
}

describe('E2E — Notification Flow', () => {
  let userAToken: string
  let userAId:    string
  let userBToken: string
  let userBId:    string

  beforeEach(async () => {
    const a = await seedUser('admin', 'userA@poms.com')
    userAToken = a.token
    userAId    = a.id

    const b = await seedUser('sub_admin', 'userB@poms.com')
    userBToken = b.token
    userBId    = b.id
  })

  // ── List & count ─────────────────────────────────────────────────────────
  it('newly created notifications appear in the user list', async () => {
    await createNotification(userAId, 'Task #1')
    await createNotification(userAId, 'Task #2')

    const res = await request(app)
      .get('/api/v1/notifications')
      .set(auth(userAToken))

    expect(res.status).toBe(200)
    expect(res.body.notifications).toHaveLength(2)
    expect(res.body.total).toBe(2)
  })

  it('unread count reflects only unread notifications', async () => {
    await createNotification(userAId)
    await createNotification(userAId)

    const res = await request(app)
      .get('/api/v1/notifications/unread-count')
      .set(auth(userAToken))

    expect(res.status).toBe(200)
    expect(res.body.count).toBe(2)
  })

  // ── Mark single read ─────────────────────────────────────────────────────
  it('marking one notification read decrements unread count by 1', async () => {
    const n1 = await createNotification(userAId, 'First')
    await createNotification(userAId, 'Second')

    await request(app)
      .patch(`/api/v1/notifications/${n1._id}/read`)
      .set(auth(userAToken))

    const countRes = await request(app)
      .get('/api/v1/notifications/unread-count')
      .set(auth(userAToken))

    expect(countRes.body.count).toBe(1)
  })

  it('marked notification has read=true in the list', async () => {
    const notif = await createNotification(userAId)

    await request(app)
      .patch(`/api/v1/notifications/${notif._id}/read`)
      .set(auth(userAToken))

    const listRes = await request(app)
      .get('/api/v1/notifications')
      .set(auth(userAToken))

    const found = listRes.body.notifications.find((n: { _id: string }) => n._id === notif._id.toString())
    expect(found.read).toBe(true)
  })

  // ── Mark all read ────────────────────────────────────────────────────────
  it('markAllRead sets every notification to read — unread count drops to 0', async () => {
    await createNotification(userAId, 'A')
    await createNotification(userAId, 'B')
    await createNotification(userAId, 'C')

    const markRes = await request(app)
      .patch('/api/v1/notifications/read-all')
      .set(auth(userAToken))

    expect(markRes.status).toBe(204)

    const countRes = await request(app)
      .get('/api/v1/notifications/unread-count')
      .set(auth(userAToken))

    expect(countRes.body.count).toBe(0)
  })

  it('markAllRead on a user with no notifications returns 204', async () => {
    const res = await request(app)
      .patch('/api/v1/notifications/read-all')
      .set(auth(userAToken))

    expect(res.status).toBe(204)
  })

  // ── User isolation ───────────────────────────────────────────────────────
  it('User B cannot see User A notifications', async () => {
    await createNotification(userAId)

    const resA = await request(app).get('/api/v1/notifications').set(auth(userAToken))
    const resB = await request(app).get('/api/v1/notifications').set(auth(userBToken))

    expect(resA.body.total).toBe(1)
    expect(resB.body.total).toBe(0)
  })

  it('User B cannot mark User A notification as read — returns 404', async () => {
    const notif = await createNotification(userAId)

    const res = await request(app)
      .patch(`/api/v1/notifications/${notif._id}/read`)
      .set(auth(userBToken))

    expect(res.status).toBe(404)
  })

  it('User B unread count is unaffected by User A notifications', async () => {
    await createNotification(userAId)
    await createNotification(userAId)

    const res = await request(app)
      .get('/api/v1/notifications/unread-count')
      .set(auth(userBToken))

    expect(res.body.count).toBe(0)
  })
})
