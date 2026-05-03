import { Types } from 'mongoose'
import { Task, TaskStatus, TaskPriority } from './task.model'
import { Order, JobType } from '../orders/order.model'
import { User } from '../auth/auth.model'
import { Notification } from '../notifications/notification.model'
import { NotFoundError, BadRequestError } from '../../utils/AppError'
import { PaginationParams } from '../../utils/pagination'

export interface CreateTaskInput {
  orderId:     string
  type:        JobType
  assignedTo?: string
  priority?:   TaskPriority
  notes?:      string
}

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

export async function createTask(data: CreateTaskInput) {
  const order = await Order.findById(data.orderId).lean()
  if (!order) throw new NotFoundError('Order not found')

  let assignedTo: Types.ObjectId | null = null
  if (data.assignedTo) {
    const user = await User.findById(data.assignedTo).lean()
    if (!user) throw new BadRequestError('Assigned user not found')
    assignedTo = new Types.ObjectId(data.assignedTo)
  }

  const task = await Task.create({
    orderId:    new Types.ObjectId(data.orderId),
    type:       data.type,
    status:     assignedTo ? 'assigned' : 'unassigned',
    assignedTo,
    priority:   data.priority ?? order.priority ?? 'normal',
    notes:      data.notes,
  })

  if (assignedTo) {
    await User.findByIdAndUpdate(assignedTo, {
      $inc: { activeTaskCount: 1 },
      $set: { lastAssignedAt: new Date() },
    })
    await Notification.create({
      userId:       assignedTo,
      type:         'task_assigned',
      title:        'New task assigned',
      message:      `Task for order ${order.orderNumber} (${data.type}) has been assigned to you.`,
      resourceId:   task._id,
      resourceType: 'task',
    })
  }

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
    if (task.assignedTo) {
      await User.findByIdAndUpdate(task.assignedTo, { $inc: { activeTaskCount: -1 } })
    }

    // Notify the order owner that this task is done
    const order = await Order.findById(task.orderId).select('orderNumber createdBy').lean()
    if (order && order.createdBy) {
      await Notification.create({
        userId:       order.createdBy,
        type:         'order_completed',
        title:        'Task completed',
        message:      `${task.type} task for order ${order.orderNumber} has been completed.`,
        resourceId:   task._id,
        resourceType: 'task',
      })
    }
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
