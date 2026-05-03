import { Router } from 'express'
import { z } from 'zod'
import { PAYMENT_TYPES, PAYMENT_METHODS, PAYMENT_STATUSES } from './payment.model'
import { asyncHandler } from '../../utils/asyncHandler'
import { authenticate } from '../../middleware/authenticate'
import { permit } from '../../middleware/authorize'
import { validate } from '../../middleware/validate'
import * as paymentService from './payment.service'
import { parsePagination } from '../../utils/pagination'

export const paymentRouter = Router()

const createPaymentSchema = z.object({
  orderId:     z.string(),
  billId:      z.string().optional(),
  type:        z.enum(PAYMENT_TYPES),
  amount:      z.number().positive(),
  method:      z.enum(PAYMENT_METHODS),
  referenceId: z.string().optional(),
  notes:       z.string().optional(),
})

paymentRouter.get('/',
  authenticate,
  permit('payments', 'read'),
  asyncHandler(async (req, res) => {
    const { orderId, status, method, type, from, to } = req.query
    const query: paymentService.ListPaymentsQuery = {}
    if (typeof orderId === 'string') query.orderId = orderId
    if (typeof status  === 'string' && (PAYMENT_STATUSES as readonly string[]).includes(status)) query.status = status as paymentService.ListPaymentsQuery['status']
    if (typeof method  === 'string' && (PAYMENT_METHODS  as readonly string[]).includes(method)) query.method = method as paymentService.ListPaymentsQuery['method']
    if (typeof type    === 'string' && (PAYMENT_TYPES    as readonly string[]).includes(type))   query.type   = type   as paymentService.ListPaymentsQuery['type']
    if (typeof from    === 'string') query.from = from
    if (typeof to      === 'string') query.to   = to
    query.pagination = parsePagination(req.query)
    const result = await paymentService.listPayments(query)
    res.json(result)
  })
)

paymentRouter.post('/',
  authenticate,
  permit('payments', 'create'),
  validate(createPaymentSchema),
  asyncHandler(async (req, res) => {
    const payment = await paymentService.createPayment({ ...req.body, collectedBy: req.user._id })
    res.status(201).json(payment)
  })
)

paymentRouter.get('/order/:orderId',
  authenticate,
  permit('payments', 'read'),
  asyncHandler(async (req, res) => {
    const result = await paymentService.getPaymentsForOrder(req.params.orderId)
    res.json(result)
  })
)

paymentRouter.patch('/:id/refund',
  authenticate,
  permit('payments', 'update'),
  asyncHandler(async (req, res) => {
    const payment = await paymentService.refundPayment(req.params.id)
    res.json(payment)
  })
)
