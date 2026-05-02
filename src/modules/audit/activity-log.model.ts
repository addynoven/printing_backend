import mongoose, { Schema, Document, Types } from 'mongoose'

export const ACTION_TYPES = [
  'create', 'update', 'delete', 'status_change', 'login', 'logout',
  'check_in', 'check_out', 'discount_apply', 'payment_collect',
] as const

export interface IActivityLog extends Document {
  userId?:     Types.ObjectId
  action:      typeof ACTION_TYPES[number]
  resource:    string
  resourceId?: Types.ObjectId
  details?:    Record<string, unknown>
  ip?:         string
  createdAt:   Date
}

const activityLogSchema = new Schema<IActivityLog>(
  {
    userId:   { type: Schema.Types.ObjectId, ref: 'User', required: false },
    action:   { type: String, enum: ACTION_TYPES, required: true },
    resource: { type: String, required: true },
    resourceId: { type: Schema.Types.ObjectId },
    details:  { type: Schema.Types.Mixed },
    ip:       { type: String },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
)

activityLogSchema.index({ userId: 1, createdAt: -1 })
activityLogSchema.index({ resource: 1, resourceId: 1, createdAt: -1 })

export const ActivityLog = mongoose.model<IActivityLog>('ActivityLog', activityLogSchema)
