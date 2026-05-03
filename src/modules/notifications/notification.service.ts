import { Notification, NotificationType, ResourceType } from './notification.model'
import { NotFoundError } from '../../utils/AppError'
import { PaginationParams } from '../../utils/pagination'

export interface CreateNotificationInput {
  userId:        string
  type:          NotificationType
  title:         string
  message:       string
  resourceId?:   string
  resourceType?: ResourceType
}

export interface ListNotificationsQuery {
  read?:       boolean
  pagination?: PaginationParams
}

export async function listNotifications(userId: string, query: ListNotificationsQuery = {}) {
  const filter: Record<string, unknown> = { userId }
  if (query.read !== undefined) filter.read = query.read

  const p = query.pagination
  const cursor = p
    ? Notification.find(filter).sort({ createdAt: -1 }).skip(p.skip).limit(p.limit)
    : Notification.find(filter)
  const notifications = await cursor.lean()
  const total = p ? await Notification.countDocuments(filter) : notifications.length
  return {
    notifications,
    total,
    page:  p?.page  ?? 1,
    limit: p?.limit ?? notifications.length,
    pages: p ? Math.max(1, Math.ceil(total / p.limit)) : 1,
  }
}

export async function getUnreadCount(userId: string) {
  const count = await Notification.countDocuments({ userId, read: false })
  return { count }
}

export async function markRead(id: string, userId: string) {
  const existing = await Notification.findById(id).lean()
  if (!existing || String(existing.userId) !== String(userId)) {
    throw new NotFoundError('Notification not found')
  }
  const doc = await Notification.findByIdAndUpdate(id, { read: true }, { new: true }).lean()
  if (!doc) throw new NotFoundError('Notification not found')
  return doc
}

export async function markAllRead(userId: string) {
  const result = await Notification.updateMany({ userId, read: false }, { read: true })
  return { updated: result.modifiedCount }
}

export async function createNotification(data: CreateNotificationInput) {
  return await Notification.create(data)
}
