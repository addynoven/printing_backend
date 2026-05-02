import { Types } from 'mongoose'
import { Attendance, AttendanceStatus } from './attendance.model'
import { logActivity } from '../audit/activity-log.service'
import { NotFoundError, ConflictError, BadRequestError } from '../../utils/AppError'

const STANDARD_SHIFT_MINUTES = 8 * 60
const LATE_THRESHOLD_MINUTES = 15

export interface CheckInInput {
  userId: string
  checkIn: Date
  notes?: string
}

export interface CheckOutInput {
  userId: string
  checkOut: Date
}

export interface ListAttendanceQuery {
  userId?: string
  from?:   string
  to?:     string
}

export async function checkIn(data: CheckInInput) {
  const date = new Date(data.checkIn)
  date.setUTCHours(0, 0, 0, 0)

  const existing = await Attendance.findOne({ userId: data.userId, date })
  if (existing) throw new ConflictError('Already checked in today')

  const scheduledStart = new Date(date)
  scheduledStart.setUTCHours(9, 0, 0, 0)

  const diffMs = data.checkIn.getTime() - scheduledStart.getTime()
  const lateMinutes = Math.max(0, Math.floor(diffMs / 60000))

  let status: AttendanceStatus = 'present'
  if (lateMinutes > LATE_THRESHOLD_MINUTES) status = 'late'

  const attendance = await Attendance.create({
    userId: data.userId,
    date,
    checkIn: data.checkIn,
    status,
    lateMinutes,
    notes: data.notes,
  })

  await logActivity({ userId: data.userId, action: 'check_in', resource: 'attendance', resourceId: attendance._id.toString(), details: { status, lateMinutes } })
  return attendance
}

export async function checkOut(data: CheckOutInput) {
  const date = new Date(data.checkOut)
  date.setUTCHours(0, 0, 0, 0)

  const attendance = await Attendance.findOne({ userId: data.userId, date })
  if (!attendance) throw new NotFoundError('No check-in record found for today')
  if (attendance.checkOut) throw new ConflictError('Already checked out')

  const checkIn = attendance.checkIn
  const checkOut = data.checkOut

  const durationMs = checkOut.getTime() - checkIn.getTime()
  const shiftDurationMinutes = Math.max(0, Math.floor(durationMs / 60000))

  let overtimeMinutes = 0
  if (shiftDurationMinutes > STANDARD_SHIFT_MINUTES) {
    overtimeMinutes = shiftDurationMinutes - STANDARD_SHIFT_MINUTES
  }

  attendance.checkOut = checkOut
  attendance.shiftDurationMinutes = shiftDurationMinutes
  attendance.overtimeMinutes = overtimeMinutes
  await attendance.save()

  await logActivity({ userId: data.userId, action: 'check_out', resource: 'attendance', resourceId: attendance._id.toString(), details: { shiftDurationMinutes, overtimeMinutes } })
  return attendance
}

export async function listAttendance(query: ListAttendanceQuery) {
  const filter: Record<string, unknown> = {}

  if (query.userId) filter.userId = query.userId
  if (query.from || query.to) {
    const dateFilter: Record<string, Date> = {}
    if (query.from) {
      const d = new Date(query.from)
      d.setUTCHours(0, 0, 0, 0)
      dateFilter.$gte = d
    }
    if (query.to) {
      const d = new Date(query.to)
      d.setUTCHours(23, 59, 59, 999)
      dateFilter.$lte = d
    }
    filter.date = dateFilter
  }

  const records = await Attendance.find(filter).sort({ date: -1 }).lean()
  return { records, total: records.length }
}

export async function getAttendanceById(id: string) {
  const record = await Attendance.findById(id).lean()
  if (!record) throw new NotFoundError('Attendance record not found')
  return record
}

export async function updateAttendance(id: string, data: { status?: AttendanceStatus; notes?: string }) {
  const record = await Attendance.findByIdAndUpdate(id, data, { new: true, runValidators: true }).lean()
  if (!record) throw new NotFoundError('Attendance record not found')
  return record
}

export async function getProductivityStats(userId: string, from?: string, to?: string) {
  const match: Record<string, unknown> = { userId: new Types.ObjectId(userId) }
  if (from || to) {
    const dateFilter: Record<string, Date> = {}
    if (from) {
      const d = new Date(from)
      d.setUTCHours(0, 0, 0, 0)
      dateFilter.$gte = d
    }
    if (to) {
      const d = new Date(to)
      d.setUTCHours(23, 59, 59, 999)
      dateFilter.$lte = d
    }
    match.date = dateFilter
  }

  const agg = await Attendance.aggregate([
    { $match: match },
    {
      $group: {
        _id: null,
        totalDays:      { $sum: 1 },
        presentDays:    { $sum: { $cond: [{ $in: ['$status', ['present', 'late']] }, 1, 0] } },
        lateDays:       { $sum: { $cond: [{ $eq: ['$status', 'late'] }, 1, 0] } },
        absentDays:     { $sum: { $cond: [{ $eq: ['$status', 'absent'] }, 1, 0] } },
        totalLateMinutes:    { $sum: '$lateMinutes' },
        totalOvertimeMinutes:{ $sum: '$overtimeMinutes' },
        avgShiftDuration:    { $avg: '$shiftDurationMinutes' },
      },
    },
  ])

  return agg[0] ?? {
    totalDays: 0,
    presentDays: 0,
    lateDays: 0,
    absentDays: 0,
    totalLateMinutes: 0,
    totalOvertimeMinutes: 0,
    avgShiftDuration: 0,
  }
}
