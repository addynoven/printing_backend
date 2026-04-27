import { vi, describe, it, expect, beforeEach } from 'vitest'

vi.mock('./task.model', () => {
  const mockTask = {
    find:              vi.fn(),
    findById:          vi.fn(),
    findByIdAndUpdate: vi.fn(),
  }
  return { Task: mockTask }
})

vi.mock('../auth/auth.model', () => {
  const mockUser = {
    findByIdAndUpdate: vi.fn(),
  }
  return { User: mockUser }
})

import * as taskService from './task.service'
import { Task } from './task.model'
import { User } from '../auth/auth.model'
import { makeTask, makeUser } from '../../../tests/helpers/mock-factory'
import { NotFoundError } from '../../utils/AppError'
import { Types } from 'mongoose'

const MockTask = vi.mocked(Task as unknown as {
  find:              ReturnType<typeof vi.fn>
  findById:          ReturnType<typeof vi.fn>
  findByIdAndUpdate: ReturnType<typeof vi.fn>
})

const MockUser = vi.mocked(User as unknown as {
  findByIdAndUpdate: ReturnType<typeof vi.fn>
})

function chain(value: unknown) {
  return { lean: vi.fn().mockResolvedValue(value) }
}

// A minimal ITask-like object for mock returns
function makeTaskDoc(overrides: Record<string, unknown> = {}) {
  const orderId    = new Types.ObjectId()
  const assignedTo = new Types.ObjectId()
  return {
    _id:          new Types.ObjectId(),
    orderId,
    type:         'flex_printing',
    assignedTo,
    status:       'assigned' as const,
    priority:     'normal' as const,
    totalMinutes: 0,
    startedAt:    undefined as Date | undefined,
    pausedAt:     undefined as Date | undefined,
    completedAt:  undefined as Date | undefined,
    createdAt:    new Date(),
    updatedAt:    new Date(),
    save: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

describe('Task Service — Unit Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ──────────────────────────────────────────────
  // listTasks
  // ──────────────────────────────────────────────
  describe('listTasks', () => {
    it('returns all tasks when no filters applied', async () => {
      const tasks = [makeTask(), makeTask({ type: 'screen_printing' })]
      MockTask.find.mockReturnValue(chain(tasks))

      const result = await taskService.listTasks({})

      expect(MockTask.find).toHaveBeenCalledWith(expect.not.objectContaining({ status: expect.anything() }))
      expect(result.tasks).toHaveLength(2)
      expect(result.total).toBe(2)
    })

    it('filters by status', async () => {
      MockTask.find.mockReturnValue(chain([]))

      await taskService.listTasks({ status: 'in_progress' })

      expect(MockTask.find).toHaveBeenCalledWith(expect.objectContaining({ status: 'in_progress' }))
    })

    it('filters by ownerId (scopeToOwn) — uses $or query with assignedTo', async () => {
      MockTask.find.mockReturnValue(chain([]))
      const ownerId = new Types.ObjectId().toString()

      await taskService.listTasks({ ownerId })

      expect(MockTask.find).toHaveBeenCalledWith(
        expect.objectContaining({
          $or: expect.arrayContaining([
            expect.objectContaining({ assignedTo: expect.anything() }),
          ]),
        })
      )
    })

    it('filters by orderId', async () => {
      MockTask.find.mockReturnValue(chain([]))
      const orderId = new Types.ObjectId().toString()

      await taskService.listTasks({ orderId })

      expect(MockTask.find).toHaveBeenCalledWith(expect.objectContaining({ orderId }))
    })
  })

  // ──────────────────────────────────────────────
  // getTaskById
  // ──────────────────────────────────────────────
  describe('getTaskById', () => {
    it('returns task when found', async () => {
      const task = makeTask()
      MockTask.findById.mockReturnValue(chain(task))

      const result = await taskService.getTaskById('task_001')

      expect(result).toMatchObject({ type: 'flex_printing' })
    })

    it('throws NotFoundError when task not found', async () => {
      MockTask.findById.mockReturnValue(chain(null))

      await expect(taskService.getTaskById('nonexistent_id')).rejects.toBeInstanceOf(NotFoundError)
    })
  })

  // ──────────────────────────────────────────────
  // updateTaskStatus
  // ──────────────────────────────────────────────
  describe('updateTaskStatus', () => {
    it('in_progress: sets startedAt and saves', async () => {
      const task = makeTaskDoc({ status: 'assigned' })
      MockTask.findById.mockReturnValue(chain(task))
      // The service will fetch the document (not lean) for mutation
      MockTask.findById.mockResolvedValueOnce(task)

      await taskService.updateTaskStatus('task_001', { status: 'in_progress' }, 'actor_001')

      expect(task.save).toHaveBeenCalled()
      expect(task.startedAt).toBeInstanceOf(Date)
    })

    it('paused: sets pausedAt and saves', async () => {
      const task = makeTaskDoc({ status: 'in_progress', startedAt: new Date(Date.now() - 60_000) })
      MockTask.findById.mockResolvedValueOnce(task)

      await taskService.updateTaskStatus('task_001', { status: 'paused' }, 'actor_001')

      expect(task.save).toHaveBeenCalled()
      expect(task.pausedAt).toBeInstanceOf(Date)
    })

    it('done: calculates totalMinutes, sets completedAt, decrements user activeTaskCount', async () => {
      const startedAt = new Date(Date.now() - 30 * 60 * 1000) // 30 min ago
      const task = makeTaskDoc({ status: 'in_progress', startedAt, assignedTo: new Types.ObjectId() })
      MockTask.findById.mockResolvedValueOnce(task)
      MockUser.findByIdAndUpdate.mockResolvedValueOnce({})

      await taskService.updateTaskStatus('task_001', { status: 'done' }, 'actor_001')

      expect(task.save).toHaveBeenCalled()
      expect(task.completedAt).toBeInstanceOf(Date)
      expect(task.totalMinutes).toBeGreaterThan(0)
      expect(MockUser.findByIdAndUpdate).toHaveBeenCalledWith(
        task.assignedTo,
        { $inc: { activeTaskCount: -1 } }
      )
    })

    it('throws NotFoundError when task not found', async () => {
      MockTask.findById.mockResolvedValueOnce(null)

      await expect(
        taskService.updateTaskStatus('bad_id', { status: 'in_progress' }, 'actor_001')
      ).rejects.toBeInstanceOf(NotFoundError)
    })
  })

  // ──────────────────────────────────────────────
  // assignTask
  // ──────────────────────────────────────────────
  describe('assignTask', () => {
    it('sets assignedTo, status becomes assigned, atomically increments assignedTo activeTaskCount', async () => {
      const task = makeTaskDoc({ status: 'unassigned', assignedTo: null })
      const newAssignee = new Types.ObjectId().toString()
      MockTask.findById.mockResolvedValueOnce(task)
      MockUser.findByIdAndUpdate.mockResolvedValueOnce({})

      await taskService.assignTask('task_001', newAssignee)

      expect(task.save).toHaveBeenCalled()
      expect(task.status).toBe('assigned')
      expect(MockUser.findByIdAndUpdate).toHaveBeenCalledWith(
        newAssignee,
        { $inc: { activeTaskCount: 1 } }
      )
    })

    it('throws NotFoundError when task not found', async () => {
      MockTask.findById.mockResolvedValueOnce(null)

      await expect(taskService.assignTask('bad_id', 'user_001')).rejects.toBeInstanceOf(NotFoundError)
    })
  })
})
