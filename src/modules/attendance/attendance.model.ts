import mongoose, { Schema, Document, Types } from 'mongoose'

export const ATTENDANCE_STATUSES = ['present', 'late', 'absent', 'half_day'] as const
export type AttendanceStatus = typeof ATTENDANCE_STATUSES[number]

export interface IAttendance extends Document {
  userId:          Types.ObjectId
  date:            Date
  checkIn:         Date
  checkOut?:       Date
  status:          AttendanceStatus
  lateMinutes:     number
  overtimeMinutes: number
  shiftDurationMinutes: number
  notes?:          string
  createdAt:       Date
  updatedAt:       Date
}

const attendanceSchema = new Schema<IAttendance>(
  {
    userId:          { type: Schema.Types.ObjectId, ref: 'User', required: true },
    date:            { type: Date, required: true },
    checkIn:         { type: Date, required: true },
    checkOut:        { type: Date },
    status:          { type: String, enum: ATTENDANCE_STATUSES, default: 'present' },
    lateMinutes:     { type: Number, default: 0 },
    overtimeMinutes: { type: Number, default: 0 },
    shiftDurationMinutes: { type: Number, default: 0 },
    notes:           { type: String },
  },
  { timestamps: true }
)

attendanceSchema.index({ userId: 1, date: 1 }, { unique: true })
attendanceSchema.index({ date: -1 })

export const Attendance = mongoose.model<IAttendance>('Attendance', attendanceSchema)
