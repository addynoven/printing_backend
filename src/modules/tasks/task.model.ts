import mongoose, { Schema, Document, Types } from 'mongoose'
import { JobType, JOB_TYPES } from '../orders/order.model'

export const TASK_STATUSES = ['unassigned', 'assigned', 'in_progress', 'paused', 'done'] as const
export const TASK_PRIORITIES = ['normal', 'urgent'] as const

export type TaskStatus   = typeof TASK_STATUSES[number]
export type TaskPriority = typeof TASK_PRIORITIES[number]

export interface ITask extends Document {
  orderId:      Types.ObjectId
  type:         JobType
  assignedTo:   Types.ObjectId | null
  status:       TaskStatus
  priority:     TaskPriority
  startedAt?:   Date
  pausedAt?:    Date
  completedAt?: Date
  totalMinutes: number
  notes?:       string
  createdAt:    Date
  updatedAt:    Date
}

const taskSchema = new Schema<ITask>(
  {
    orderId:     { type: Schema.Types.ObjectId, ref: 'Order', required: true },
    type:        { type: String, enum: JOB_TYPES, required: true },
    assignedTo:  { type: Schema.Types.ObjectId, ref: 'User', default: null },
    status:      { type: String, enum: TASK_STATUSES, default: 'unassigned' },
    priority:    { type: String, enum: TASK_PRIORITIES, default: 'normal' },
    startedAt:   Date,
    pausedAt:    Date,
    completedAt: Date,
    totalMinutes: { type: Number, default: 0 },
    notes:       String,
  },
  { timestamps: true }
)

taskSchema.index({ orderId: 1 })
taskSchema.index({ assignedTo: 1, status: 1 })
taskSchema.index({ status: 1 })

export const Task = mongoose.model<ITask>('Task', taskSchema)
