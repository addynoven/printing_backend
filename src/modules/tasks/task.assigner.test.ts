import { vi, describe, it, expect, beforeEach } from 'vitest'

vi.mock('./task.model', () => ({
  Task: { create: vi.fn() },
}))

vi.mock('../auth/auth.model', () => ({
  User: {
    findOne:           vi.fn(),
    findByIdAndUpdate: vi.fn(),
  },
}))

vi.mock('../notifications/notification.model', () => ({
  Notification: { create: vi.fn() },
}))

import { autoAssignTask } from './task.assigner'
import { Task } from './task.model'
import { User } from '../auth/auth.model'
import { Notification } from '../notifications/notification.model'
import { Types } from 'mongoose'

const MockTask = vi.mocked(Task as unknown as { create: ReturnType<typeof vi.fn> })
const MockUser = vi.mocked(User as unknown as {
  findOne:           ReturnType<typeof vi.fn>
  findByIdAndUpdate: ReturnType<typeof vi.fn>
})
const MockNotification = vi.mocked(Notification as unknown as {
  create: ReturnType<typeof vi.fn>
})

// User.findOne().sort() chain helper
function userChain(value: unknown) {
  return { sort: vi.fn().mockResolvedValue(value) }
}

function makeOrder(jobType = 'flex_printing') {
  return {
    _id:         new Types.ObjectId(),
    orderNumber: 'ORD-TEST-001',
    jobType,
    status:      'confirmed',
    createdBy:   new Types.ObjectId(),
    bom:         [],
    items:       [],
  }
}

describe('Task Assigner — Unit Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('autoAssignTask(order)', () => {
    it('creates a task with the correct orderId and jobType', async () => {
      const order   = makeOrder('flex_printing')
      const staffId = new Types.ObjectId()
      MockUser.findOne.mockReturnValue(userChain({ _id: staffId }))
      MockTask.create.mockResolvedValue({ _id: new Types.ObjectId() })
      MockUser.findByIdAndUpdate.mockResolvedValue({})

      await autoAssignTask(order as never)

      expect(MockTask.create).toHaveBeenCalledWith(
        expect.objectContaining({
          orderId: order._id,
          type:    'flex_printing',
        })
      )
    })

    it('looks up staff by the role mapped from jobType', async () => {
      const order   = makeOrder('screen_printing')
      const staffId = new Types.ObjectId()
      MockUser.findOne.mockReturnValue(userChain({ _id: staffId }))
      MockTask.create.mockResolvedValue({ _id: new Types.ObjectId() })
      MockUser.findByIdAndUpdate.mockResolvedValue({})

      await autoAssignTask(order as never)

      expect(MockUser.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          role:        'screen_printing_staff',
          isAvailable: true,
          isActive:    true,
        })
      )
    })

    it('creates an assigned task and increments activeTaskCount when staff is found', async () => {
      const order   = makeOrder('flex_printing')
      const staffId = new Types.ObjectId()
      MockUser.findOne.mockReturnValue(userChain({ _id: staffId }))
      MockTask.create.mockResolvedValue({ _id: new Types.ObjectId() })
      MockUser.findByIdAndUpdate.mockResolvedValue({})

      await autoAssignTask(order as never)

      expect(MockTask.create).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'assigned', assignedTo: staffId })
      )
      expect(MockUser.findByIdAndUpdate).toHaveBeenCalledWith(
        staffId,
        expect.objectContaining({ $inc: { activeTaskCount: 1 } })
      )
    })

    it('creates an unassigned task and skips User.findByIdAndUpdate when no staff available', async () => {
      const order = makeOrder('flex_printing')
      MockUser.findOne.mockReturnValue(userChain(null))
      MockTask.create.mockResolvedValue({ _id: new Types.ObjectId() })

      await autoAssignTask(order as never)

      expect(MockTask.create).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'unassigned', assignedTo: null })
      )
      expect(MockUser.findByIdAndUpdate).not.toHaveBeenCalled()
    })

    it('picks the least-loaded staff — sorts by activeTaskCount asc', async () => {
      const order   = makeOrder('flex_printing')
      const staffId = new Types.ObjectId()
      const sortMock = vi.fn().mockResolvedValue({ _id: staffId })
      MockUser.findOne.mockReturnValue({ sort: sortMock })
      MockTask.create.mockResolvedValue({ _id: new Types.ObjectId() })
      MockUser.findByIdAndUpdate.mockResolvedValue({})

      await autoAssignTask(order as never)

      expect(sortMock).toHaveBeenCalledWith(
        expect.objectContaining({ activeTaskCount: 1 })
      )
    })

    it('updates lastAssignedAt on the staff member', async () => {
      const order   = makeOrder('flex_printing')
      const staffId = new Types.ObjectId()
      MockUser.findOne.mockReturnValue(userChain({ _id: staffId }))
      MockTask.create.mockResolvedValue({ _id: new Types.ObjectId() })
      MockUser.findByIdAndUpdate.mockResolvedValue({})

      await autoAssignTask(order as never)

      expect(MockUser.findByIdAndUpdate).toHaveBeenCalledWith(
        staffId,
        expect.objectContaining({ $set: { lastAssignedAt: expect.any(Date) } })
      )
    })

    it('sends a task_assigned notification to the assigned staff', async () => {
      const order   = makeOrder('flex_printing')
      const staffId = new Types.ObjectId()
      const taskId  = new Types.ObjectId()
      MockUser.findOne.mockReturnValue(userChain({ _id: staffId }))
      MockTask.create.mockResolvedValue({ _id: taskId })
      MockUser.findByIdAndUpdate.mockResolvedValue({})
      MockNotification.create.mockResolvedValue({})

      await autoAssignTask(order as never)

      expect(MockNotification.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId:       staffId,
          type:         'task_assigned',
          resourceId:   taskId,
          resourceType: 'task',
        })
      )
    })

    it('does NOT send a notification when no staff is available', async () => {
      const order = makeOrder('flex_printing')
      MockUser.findOne.mockReturnValue(userChain(null))
      MockTask.create.mockResolvedValue({ _id: new Types.ObjectId() })

      await autoAssignTask(order as never)

      expect(MockNotification.create).not.toHaveBeenCalled()
    })
  })
})
