import { Notification, NotificationType, ResourceType } from './notification.model'
import { NotFoundError } from '../../utils/AppError'

export interface CreateNotificationInput {
  userId:        string
  type:          NotificationType
  title:         string
  message:       string
  resourceId?:   string
  resourceType?: ResourceType
}

export async function listNotifications(userId: string) {
  const notifications = await Notification.find({ userId }).lean()
  return { notifications, total: notifications.length }
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
