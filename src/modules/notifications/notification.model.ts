import mongoose, { Schema, Document, Types } from 'mongoose'

export const NOTIFICATION_TYPES = [
  'task_assigned', 'task_delayed', 'low_stock',
  'order_completed', 'payment_received',
] as const

export const RESOURCE_TYPES = ['order', 'task', 'material', 'payment'] as const

export type NotificationType = typeof NOTIFICATION_TYPES[number]
export type ResourceType     = typeof RESOURCE_TYPES[number]

export interface INotification extends Document {
  userId:       Types.ObjectId
  type:         NotificationType
  title:        string
  message:      string
  resourceId?:  Types.ObjectId
  resourceType?: ResourceType
  read:         boolean
  createdAt:    Date
}

const notificationSchema = new Schema<INotification>(
  {
    userId:       { type: Schema.Types.ObjectId, ref: 'User', required: true },
    type:         { type: String, enum: NOTIFICATION_TYPES, required: true },
    title:        { type: String, required: true },
    message:      { type: String, required: true },
    resourceId:   { type: Schema.Types.ObjectId },
    resourceType: { type: String, enum: RESOURCE_TYPES },
    read:         { type: Boolean, default: false },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
)

notificationSchema.index({ userId: 1, read: 1 })
notificationSchema.index({ createdAt: -1 })

export const Notification = mongoose.model<INotification>('Notification', notificationSchema)
