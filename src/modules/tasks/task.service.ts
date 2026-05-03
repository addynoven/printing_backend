import { Types } from 'mongoose'
import { Task, TaskStatus } from './task.model'
import { User } from '../auth/auth.model'
import { NotFoundError } from '../../utils/AppError'
import { PaginationParams } from '../../utils/pagination'

export interface ListTasksQuery {
  status?:     TaskStatus
  assignedTo?: string
  orderId?:    string
  ownerId?:    string
  pagination?: PaginationParams
}

export interface UpdateTaskStatusInput {
  status: TaskStatus
  notes?: string
}

export async function listTasks(query: ListTasksQuery) {
  const filter: Record<string, unknown> = {}

  if (query.status)  filter.status  = query.status
  if (query.orderId) filter.orderId = query.orderId
  if (query.ownerId) {
    filter.$or = [{ assignedTo: new Types.ObjectId(query.ownerId) }]
  }

  const p = query.pagination
  const cursor = p ? Task.find(filter).sort({ createdAt: -1 }).skip(p.skip).limit(p.limit) : Task.find(filter)
  const tasks = await cursor.lean()
  const total = p ? await Task.countDocuments(filter) : tasks.length
  return {
    tasks,
    total,
    page:  p?.page  ?? 1,
    limit: p?.limit ?? tasks.length,
    pages: p ? Math.max(1, Math.ceil(total / p.limit)) : 1,
  }
}

export async function getTaskById(id: string) {
  const task = await Task.findById(id).lean()
  if (!task) throw new NotFoundError('Task not found')
  return task
}

export async function updateTaskStatus(id: string, data: UpdateTaskStatusInput, _actorId: string) {
  const task = await Task.findById(id)
  if (!task) throw new NotFoundError('Task not found')

  task.status = data.status

  if (data.status === 'in_progress') {
    task.startedAt = new Date()
  } else if (data.status === 'paused') {
    task.pausedAt = new Date()
  } else if (data.status === 'done') {
    const completedAt = new Date()
    task.completedAt = completedAt
    if (task.startedAt) {
      task.totalMinutes = Math.round((completedAt.getTime() - task.startedAt.getTime()) / 60_000)
    }
    await task.save()
    await User.findByIdAndUpdate(task.assignedTo, { $inc: { activeTaskCount: -1 } })
    return task
  }

  await task.save()
  return task
}

export async function assignTask(id: string, assignedTo: string) {
  const task = await Task.findById(id)
  if (!task) throw new NotFoundError('Task not found')

  task.assignedTo = new Types.ObjectId(assignedTo)
  task.status = 'assigned'
  await task.save()
  await User.findByIdAndUpdate(assignedTo, { $inc: { activeTaskCount: 1 } })
  return task
}
