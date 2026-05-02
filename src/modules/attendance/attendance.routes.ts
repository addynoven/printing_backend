import { Router } from 'express'
import { z } from 'zod'
import { ATTENDANCE_STATUSES } from './attendance.model'
import { asyncHandler } from '../../utils/asyncHandler'
import { authenticate } from '../../middleware/authenticate'
import { permit } from '../../middleware/authorize'
import { validate } from '../../middleware/validate'
import * as attendanceService from './attendance.service'
import { logActivity } from '../audit/activity-log.service'

export const attendanceRouter = Router()

const checkInSchema = z.object({
  checkIn: z.string().datetime(),
  notes:   z.string().optional(),
})

const checkOutSchema = z.object({
  checkOut: z.string().datetime(),
})

const updateSchema = z.object({
  status: z.enum(ATTENDANCE_STATUSES).optional(),
  notes:  z.string().optional(),
})

attendanceRouter.get('/',
  authenticate,
  permit('attendance', 'read'),
  asyncHandler(async (req, res) => {
    const { userId, from, to } = req.query
    const query: attendanceService.ListAttendanceQuery = {}
    if (typeof userId === 'string') query.userId = userId
    if (typeof from === 'string') query.from = from
    if (typeof to === 'string') query.to = to

    const result = await attendanceService.listAttendance(query)
    res.json(result)
  })
)

attendanceRouter.post('/check-in',
  authenticate,
  permit('attendance', 'create'),
  validate(checkInSchema),
  asyncHandler(async (req, res) => {
    const record = await attendanceService.checkIn({
      userId: req.user._id,
      checkIn: new Date(req.body.checkIn),
      notes: req.body.notes,
    })
    res.status(201).json(record)
  })
)

attendanceRouter.post('/check-out',
  authenticate,
  permit('attendance', 'create'),
  validate(checkOutSchema),
  asyncHandler(async (req, res) => {
    const record = await attendanceService.checkOut({
      userId: req.user._id,
      checkOut: new Date(req.body.checkOut),
    })
    res.json(record)
  })
)

attendanceRouter.get('/stats/:userId',
  authenticate,
  permit('attendance', 'read'),
  asyncHandler(async (req, res) => {
    const { from, to } = req.query
    const stats = await attendanceService.getProductivityStats(
      req.params.userId,
      typeof from === 'string' ? from : undefined,
      typeof to === 'string' ? to : undefined
    )
    res.json(stats)
  })
)

attendanceRouter.get('/:id',
  authenticate,
  permit('attendance', 'read'),
  asyncHandler(async (req, res) => {
    const record = await attendanceService.getAttendanceById(req.params.id)
    res.json(record)
  })
)

attendanceRouter.patch('/:id',
  authenticate,
  permit('attendance', 'update'),
  validate(updateSchema),
  asyncHandler(async (req, res) => {
    const record = await attendanceService.updateAttendance(req.params.id, req.body)
    await logActivity({ userId: req.user._id, action: 'update', resource: 'attendance', resourceId: req.params.id, details: req.body })
    res.json(record)
  })
)
