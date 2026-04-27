import { Router } from 'express'
import { z } from 'zod'
import { PAYMENT_TYPES, PAYMENT_METHODS } from './payment.model'
import { asyncHandler } from '../../utils/asyncHandler'
import { authenticate } from '../../middleware/authenticate'
import { permit } from '../../middleware/authorize'
import { validate } from '../../middleware/validate'
import * as paymentService from './payment.service'

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
  asyncHandler(async (_req, res) => {
    const result = await paymentService.listPayments()
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
