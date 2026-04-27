import { Router } from 'express'
import { z } from 'zod'
import { JOB_TYPES, ORDER_STATUSES, PRIORITIES } from './order.model'
import { asyncHandler } from '../../utils/asyncHandler'
import { authenticate } from '../../middleware/authenticate'
import { permit } from '../../middleware/authorize'
import { validate } from '../../middleware/validate'
import * as orderService from './order.service'

export const orderRouter = Router()

const createOrderSchema = z.object({
  customer: z.object({
    name:  z.string().min(2),
    phone: z.string().min(7),
    email: z.string().email().optional(),
  }),
  jobType:      z.enum(JOB_TYPES),
  items: z.array(z.object({
    description: z.string().min(1),
    quantity:    z.number().positive(),
    unit:        z.string().min(1),
    unitPrice:   z.number().positive(),
  })).min(1),
  bom: z.array(z.object({
    materialId: z.string(),
    name:       z.string().optional(),
    unit:       z.string().optional(),
    qty:        z.number().positive(),
  })).optional(),
  rawCost:      z.number().positive(),
  taxableValue: z.number().positive(),
  billSplitPct: z.number().min(0).max(100),
  hsnCode:      z.string().optional(),
  priority:     z.enum(PRIORITIES).optional(),
  deadline:     z.string().datetime().optional(),
  notes:        z.string().optional(),
})

const updateOrderSchema = z.object({
  customer: z.object({
    name:  z.string().min(2).optional(),
    phone: z.string().min(7).optional(),
    email: z.string().email().optional(),
  }).optional(),
  rawCost:      z.number().positive().optional(),
  taxableValue: z.number().positive().optional(),
  billSplitPct: z.number().min(0).max(100).optional(),
  hsnCode:      z.string().optional(),
  priority:     z.enum(PRIORITIES).optional(),
  deadline:     z.string().datetime().optional(),
  notes:        z.string().optional(),
})

const statusSchema = z.object({
  status: z.enum(ORDER_STATUSES),
  note:   z.string().optional(),
})

orderRouter.get('/',
  authenticate,
  permit('orders', 'read'),
  asyncHandler(async (req, res) => {
    const { status, jobType, priority, from, to } = req.query
    const query: orderService.ListOrdersQuery = {}

    if (typeof status   === 'string') query.status   = status   as orderService.ListOrdersQuery['status']
    if (typeof jobType  === 'string') query.jobType  = jobType  as orderService.ListOrdersQuery['jobType']
    if (typeof priority === 'string') query.priority = priority as orderService.ListOrdersQuery['priority']
    if (typeof from     === 'string') query.from = from
    if (typeof to       === 'string') query.to   = to

    if (req.scopeToOwn) query.ownerId = req.user._id

    const result = await orderService.listOrders(query)
    res.json(result)
  })
)

orderRouter.post('/',
  authenticate,
  permit('orders', 'create'),
  validate(createOrderSchema),
  asyncHandler(async (req, res) => {
    const order = await orderService.createOrder({ ...req.body, createdBy: req.user._id })
    res.status(201).json(order)
  })
)

orderRouter.get('/:id',
  authenticate,
  permit('orders', 'read'),
  asyncHandler(async (req, res) => {
    const order = await orderService.getOrderById(req.params.id)
    res.json(order)
  })
)

orderRouter.patch('/:id',
  authenticate,
  permit('orders', 'update'),
  validate(updateOrderSchema),
  asyncHandler(async (req, res) => {
    const order = await orderService.updateOrder(req.params.id, req.body)
    res.json(order)
  })
)

orderRouter.delete('/:id',
  authenticate,
  permit('orders', 'delete'),
  asyncHandler(async (req, res) => {
    await orderService.setOrderStatus(req.params.id, 'cancelled', req.user._id, 'Cancelled by admin')
    res.status(204).send()
  })
)

orderRouter.patch('/:id/status',
  authenticate,
  permit('orders', 'update'),
  validate(statusSchema),
  asyncHandler(async (req, res) => {
    const order = await orderService.setOrderStatus(
      req.params.id,
      req.body.status,
      req.user._id,
      req.body.note
    )
    res.json(order)
  })
)

orderRouter.get('/:id/timeline',
  authenticate,
  permit('orders', 'read'),
  asyncHandler(async (req, res) => {
    const timeline = await orderService.getTimeline(req.params.id)
    res.json(timeline)
  })
)
