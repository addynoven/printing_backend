import { vi, describe, it, expect, beforeEach } from 'vitest'

vi.mock('./notification.model', () => {
  const mockNotification = {
    find:              vi.fn(),
    findOne:           vi.fn(),
    create:            vi.fn(),
    findById:          vi.fn(),
    findByIdAndUpdate: vi.fn(),
    updateMany:        vi.fn(),
    countDocuments:    vi.fn(),
  }
  return { Notification: mockNotification }
})

import * as notificationService from './notification.service'
import { Notification } from './notification.model'
import { makeNotification } from '../../../tests/helpers/mock-factory'
import { NotFoundError } from '../../utils/AppError'

const MockNotification = vi.mocked(Notification as unknown as {
  find:              ReturnType<typeof vi.fn>
  findOne:           ReturnType<typeof vi.fn>
  create:            ReturnType<typeof vi.fn>
  findById:          ReturnType<typeof vi.fn>
  findByIdAndUpdate: ReturnType<typeof vi.fn>
  updateMany:        ReturnType<typeof vi.fn>
  countDocuments:    ReturnType<typeof vi.fn>
})

// chain helper: .lean() resolves to value
function chain(value: unknown) {
  return { lean: vi.fn().mockResolvedValue(value) }
}

const USER_A = 'aaaaaaaaaaaaaaaaaaaaaaaa'
const USER_B = 'bbbbbbbbbbbbbbbbbbbbbbbb'
const NOTIF_ID = 'cccccccccccccccccccccccc'

describe('Notification Service — Unit Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ─────────────────────────────────────────────
  // listNotifications
  // ─────────────────────────────────────────────
  describe('listNotifications(userId)', () => {
    it('returns { notifications, total } scoped to the given userId only', async () => {
      const notifs = [
        makeNotification({ userId: USER_A, title: 'Notif 1' }),
        makeNotification({ userId: USER_A, title: 'Notif 2' }),
      ]
      MockNotification.find.mockReturnValue(chain(notifs))

      const result = await notificationService.listNotifications(USER_A)

      expect(MockNotification.find).toHaveBeenCalledWith(
        expect.objectContaining({ userId: USER_A })
      )
      expect(result).toMatchObject({ notifications: notifs, total: 2 })
    })

    it('does not return notifications belonging to a different userId', async () => {
      MockNotification.find.mockReturnValue(chain([]))

      const result = await notificationService.listNotifications(USER_B)

      expect(MockNotification.find).toHaveBeenCalledWith(
        expect.objectContaining({ userId: USER_B })
      )
      expect(result).toMatchObject({ notifications: [], total: 0 })
    })
  })

  // ─────────────────────────────────────────────
  // getUnreadCount
  // ─────────────────────────────────────────────
  describe('getUnreadCount(userId)', () => {
    it('returns { count: N } for unread notifications of the given userId', async () => {
      MockNotification.countDocuments.mockResolvedValue(3)

      const result = await notificationService.getUnreadCount(USER_A)

      expect(MockNotification.countDocuments).toHaveBeenCalledWith(
        expect.objectContaining({ userId: USER_A, read: false })
      )
      expect(result).toMatchObject({ count: 3 })
    })

    it('returns { count: 0 } when user has no unread notifications', async () => {
      MockNotification.countDocuments.mockResolvedValue(0)

      const result = await notificationService.getUnreadCount(USER_A)

      expect(result).toMatchObject({ count: 0 })
    })

    it('does not count read notifications', async () => {
      MockNotification.countDocuments.mockResolvedValue(1)

      await notificationService.getUnreadCount(USER_A)

      expect(MockNotification.countDocuments).toHaveBeenCalledWith(
        expect.objectContaining({ read: false })
      )
    })
  })

  // ─────────────────────────────────────────────
  // markRead
  // ─────────────────────────────────────────────
  describe('markRead(id, userId)', () => {
    it('sets read=true and returns the updated notification', async () => {
      const existing = makeNotification({ userId: USER_A })
      const updated  = makeNotification({ userId: USER_A, read: true })
      MockNotification.findById.mockReturnValue(chain(existing))
      MockNotification.findByIdAndUpdate.mockReturnValue(chain(updated))

      const result = await notificationService.markRead(NOTIF_ID, USER_A)

      expect(MockNotification.findByIdAndUpdate).toHaveBeenCalledWith(
        NOTIF_ID,
        expect.objectContaining({ read: true }),
        expect.objectContaining({ new: true })
      )
      expect(result).toMatchObject({ read: true })
    })

    it('throws NotFoundError when notification does not exist', async () => {
      MockNotification.findById.mockReturnValue(chain(null))

      await expect(
        notificationService.markRead(NOTIF_ID, USER_A)
      ).rejects.toBeInstanceOf(NotFoundError)
    })

    it('throws NotFoundError when notification belongs to a different user', async () => {
      // findById returns a notification owned by USER_A
      MockNotification.findById.mockReturnValue(chain(makeNotification({ userId: USER_A })))

      await expect(
        notificationService.markRead(NOTIF_ID, USER_B)
      ).rejects.toBeInstanceOf(NotFoundError)

      // findByIdAndUpdate must NOT be called — rejection happens at ownership check
      expect(MockNotification.findByIdAndUpdate).not.toHaveBeenCalled()
    })
  })

  // ─────────────────────────────────────────────
  // markAllRead
  // ─────────────────────────────────────────────
  describe('markAllRead(userId)', () => {
    it('updates all unread notifications for userId and returns { updated: N }', async () => {
      MockNotification.updateMany.mockResolvedValue({ modifiedCount: 5 })

      const result = await notificationService.markAllRead(USER_A)

      expect(MockNotification.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ userId: USER_A, read: false }),
        expect.objectContaining({ read: true })
      )
      expect(result).toMatchObject({ updated: 5 })
    })

    it('returns { updated: 0 } when there are no unread notifications', async () => {
      MockNotification.updateMany.mockResolvedValue({ modifiedCount: 0 })

      const result = await notificationService.markAllRead(USER_A)

      expect(result).toMatchObject({ updated: 0 })
    })
  })

  // ─────────────────────────────────────────────
  // createNotification
  // ─────────────────────────────────────────────
  describe('createNotification(data)', () => {
    it('creates and returns a notification', async () => {
      const input = {
        userId:       USER_A,
        type:         'task_assigned' as const,
        title:        'New Task',
        message:      'You have a task.',
        resourceId:   NOTIF_ID,
        resourceType: 'task' as const,
      }
      const created = makeNotification({ ...input, _id: NOTIF_ID })
      MockNotification.create.mockResolvedValue(created)

      const result = await notificationService.createNotification(input)

      expect(MockNotification.create).toHaveBeenCalledWith(
        expect.objectContaining({ userId: USER_A, type: 'task_assigned' })
      )
      expect(result).toMatchObject({ userId: USER_A, type: 'task_assigned', read: false })
    })

    it('creates notification without optional resourceId/resourceType', async () => {
      const input = {
        userId:  USER_A,
        type:    'low_stock' as const,
        title:   'Low Stock Alert',
        message: 'Material is running low.',
      }
      const created = makeNotification({ userId: USER_A, type: 'low_stock', title: 'Low Stock Alert' })
      MockNotification.create.mockResolvedValue(created)

      const result = await notificationService.createNotification(input)

      expect(result).toMatchObject({ type: 'low_stock' })
    })
  })
})
