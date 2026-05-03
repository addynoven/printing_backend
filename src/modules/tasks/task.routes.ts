import { Router } from 'express'
import { z } from 'zod'
import { TASK_STATUSES, TASK_PRIORITIES } from './task.model'
import { JOB_TYPES } from '../orders/order.model'
import { asyncHandler } from '../../utils/asyncHandler'
import { authenticate } from '../../middleware/authenticate'
import { permit } from '../../middleware/authorize'
import { validate } from '../../middleware/validate'
import * as taskService from './task.service'
import { parsePagination } from '../../utils/pagination'

export const taskRouter = Router()

const updateStatusSchema = z.object({
  status: z.enum(TASK_STATUSES),
  notes:  z.string().optional(),
})

const assignSchema = z.object({
  assignedTo: z.string(),
})

const createTaskSchema = z.object({
  orderId:    z.string().min(1),
  type:       z.enum(JOB_TYPES),
  assignedTo: z.string().optional(),
  priority:   z.enum(TASK_PRIORITIES).optional(),
  notes:      z.string().optional(),
})

taskRouter.get('/',
  authenticate,
  permit('tasks', 'read'),
  asyncHandler(async (req, res) => {
    const { status, assignedTo, orderId } = req.query
    const query: taskService.ListTasksQuery = {}
    if (typeof status     === 'string') query.status     = status as taskService.ListTasksQuery['status']
    if (typeof assignedTo === 'string') query.assignedTo = assignedTo
    if (typeof orderId    === 'string') query.orderId    = orderId
    if (req.scopeToOwn) query.ownerId = req.user._id
    query.pagination = parsePagination(req.query)
    const result = await taskService.listTasks(query)
    res.json(result)
  })
)

taskRouter.post('/',
  authenticate,
  permit('tasks', 'create'),
  validate(createTaskSchema),
  asyncHandler(async (req, res) => {
    const task = await taskService.createTask(req.body)
    res.status(201).json(task)
  })
)

taskRouter.get('/:id',
  authenticate,
  permit('tasks', 'read'),
  asyncHandler(async (req, res) => {
    const task = await taskService.getTaskById(req.params.id)
    res.json(task)
  })
)

taskRouter.patch('/:id/status',
  authenticate,
  permit('tasks', 'update'),
  validate(updateStatusSchema),
  asyncHandler(async (req, res) => {
    const task = await taskService.updateTaskStatus(req.params.id, req.body, req.user._id)
    res.json(task)
  })
)

taskRouter.patch('/:id/assign',
  authenticate,
  permit('tasks', 'update'),
  validate(assignSchema),
  asyncHandler(async (req, res) => {
    const task = await taskService.assignTask(req.params.id, req.body.assignedTo)
    res.json(task)
  })
)
