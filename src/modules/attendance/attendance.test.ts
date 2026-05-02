import { vi, describe, it, expect, beforeEach } from 'vitest'

vi.mock('./attendance.model', () => ({
  Attendance: {
    findOne: vi.fn(),
    find: vi.fn(),
    findById: vi.fn(),
    findByIdAndUpdate: vi.fn(),
    create: vi.fn(),
    aggregate: vi.fn(),
  },
  ATTENDANCE_STATUSES: ['present', 'late', 'absent', 'half_day'],
}))

function chain(value: unknown) {
  return { sort: vi.fn().mockReturnThis(), lean: vi.fn().mockResolvedValue(value) }
}

import * as attendanceService from './attendance.service'
import { Attendance } from './attendance.model'
import { NotFoundError, ConflictError } from '../../utils/AppError'

const MockAttendance = vi.mocked(Attendance as unknown as {
  findOne: ReturnType<typeof vi.fn>
  find: ReturnType<typeof vi.fn>
  findById: ReturnType<typeof vi.fn>
  findByIdAndUpdate: ReturnType<typeof vi.fn>
  create: ReturnType<typeof vi.fn>
  aggregate: ReturnType<typeof vi.fn>
})

function makeAttDoc(overrides: Record<string, unknown> = {}) {
  return {
    _id: 'att_1',
    userId: 'usr_1',
    date: new Date(),
    checkIn: new Date('2024-01-15T09:00:00Z'),
    checkOut: undefined,
    status: 'present',
    lateMinutes: 0,
    overtimeMinutes: 0,
    shiftDurationMinutes: 0,
    save: vi.fn().mockResolvedValue(true),
    ...overrides,
  }
}

describe('Attendance Service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('checkIn', () => {
    it('creates attendance record', async () => {
      MockAttendance.findOne.mockResolvedValue(null)
      MockAttendance.create.mockResolvedValue(makeAttDoc())

      const result = await attendanceService.checkIn({ userId: 'usr_1', checkIn: new Date('2024-01-15T09:00:00Z') })

      expect(MockAttendance.create).toHaveBeenCalledWith(expect.objectContaining({ userId: 'usr_1', status: 'present' }))
      expect(result.status).toBe('present')
    })

    it('marks late when after 9:15', async () => {
      MockAttendance.findOne.mockResolvedValue(null)
      MockAttendance.create.mockResolvedValue(makeAttDoc({ status: 'late', lateMinutes: 30 }))

      const result = await attendanceService.checkIn({ userId: 'usr_1', checkIn: new Date('2024-01-15T09:30:00Z') })

      expect(MockAttendance.create).toHaveBeenCalledWith(expect.objectContaining({ status: 'late', lateMinutes: 30 }))
      expect(result.status).toBe('late')
    })

    it('throws ConflictError if already checked in', async () => {
      MockAttendance.findOne.mockResolvedValue(makeAttDoc())
      await expect(attendanceService.checkIn({ userId: 'usr_1', checkIn: new Date() })).rejects.toBeInstanceOf(ConflictError)
    })
  })

  describe('checkOut', () => {
    it('records check-out and calculates shift duration', async () => {
      const doc = makeAttDoc({ checkIn: new Date('2024-01-15T09:00:00Z'), save: vi.fn().mockResolvedValue(true) })
      MockAttendance.findOne.mockResolvedValue(doc)

      const result = await attendanceService.checkOut({ userId: 'usr_1', checkOut: new Date('2024-01-15T18:00:00Z') })

      expect(doc.save).toHaveBeenCalled()
      expect(result.shiftDurationMinutes).toBe(540) // 9 hours
      expect(result.overtimeMinutes).toBe(60) // 1 hour over 8h
    })

    it('throws NotFoundError if no check-in', async () => {
      MockAttendance.findOne.mockResolvedValue(null)
      await expect(attendanceService.checkOut({ userId: 'usr_1', checkOut: new Date() })).rejects.toBeInstanceOf(NotFoundError)
    })

    it('throws ConflictError if already checked out', async () => {
      MockAttendance.findOne.mockResolvedValue(makeAttDoc({ checkOut: new Date() }))
      await expect(attendanceService.checkOut({ userId: 'usr_1', checkOut: new Date() })).rejects.toBeInstanceOf(ConflictError)
    })
  })

  describe('listAttendance', () => {
    it('returns records with filters', async () => {
      const records = [makeAttDoc(), makeAttDoc()]
      MockAttendance.find.mockReturnValue(chain(records))

      const result = await attendanceService.listAttendance({ userId: 'usr_1', from: '2024-01-01', to: '2024-01-31' })

      expect(result.total).toBe(2)
    })
  })

  describe('getAttendanceById', () => {
    it('returns record when found', async () => {
      MockAttendance.findById.mockReturnValue(chain(makeAttDoc()))
      const result = await attendanceService.getAttendanceById('att_1')
      expect(result._id).toBe('att_1')
    })

    it('throws NotFoundError when missing', async () => {
      MockAttendance.findById.mockReturnValue(chain(null))
      await expect(attendanceService.getAttendanceById('missing')).rejects.toBeInstanceOf(NotFoundError)
    })
  })

  describe('updateAttendance', () => {
    it('updates status and notes', async () => {
      MockAttendance.findByIdAndUpdate.mockReturnValue(chain(makeAttDoc({ status: 'half_day' })))
      const result = await attendanceService.updateAttendance('att_1', { status: 'half_day' })
      expect(result.status).toBe('half_day')
    })

    it('throws NotFoundError when missing', async () => {
      MockAttendance.findByIdAndUpdate.mockReturnValue(chain(null))
      await expect(attendanceService.updateAttendance('missing', {})).rejects.toBeInstanceOf(NotFoundError)
    })
  })

  describe('getProductivityStats', () => {
    it('returns aggregated stats', async () => {
      MockAttendance.aggregate.mockResolvedValue([{
        totalDays: 20,
        presentDays: 18,
        lateDays: 2,
        absentDays: 0,
        totalLateMinutes: 30,
        totalOvertimeMinutes: 120,
        avgShiftDuration: 480,
      }])

      const result = await attendanceService.getProductivityStats('69f383a1664f6d7a1300764e')

      expect(result.totalDays).toBe(20)
      expect(result.presentDays).toBe(18)
    })

    it('returns zeros when no data', async () => {
      MockAttendance.aggregate.mockResolvedValue([])
      const result = await attendanceService.getProductivityStats('69f383a1664f6d7a1300764e')
      expect(result.totalDays).toBe(0)
      expect(result.presentDays).toBe(0)
    })
  })
})
