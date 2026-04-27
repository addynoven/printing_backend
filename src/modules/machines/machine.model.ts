import mongoose, { Schema, Document } from 'mongoose'

export const MACHINE_TYPES = [
  'flex_printer',
  'screen_printer',
  'laser_cutter',
  'offset_printer',
  'acrylic_printer',
  'glass_printer',
] as const

export const MACHINE_STATUSES = ['active', 'maintenance', 'inactive'] as const

export type MachineType   = typeof MACHINE_TYPES[number]
export type MachineStatus = typeof MACHINE_STATUSES[number]

export interface IMachine extends Document {
  name:       string
  type:       MachineType
  department: string
  status:     MachineStatus
  notes?:     string
  createdAt:  Date
  updatedAt:  Date
}

const machineSchema = new Schema<IMachine>(
  {
    name:       { type: String, required: true, trim: true },
    type:       { type: String, enum: MACHINE_TYPES, required: true },
    department: { type: String, required: true, trim: true },
    status:     { type: String, enum: MACHINE_STATUSES, default: 'active' },
    notes:      { type: String },
  },
  { timestamps: true }
)

machineSchema.index({ type: 1 })
machineSchema.index({ status: 1 })

export const Machine = mongoose.model<IMachine>('Machine', machineSchema)
