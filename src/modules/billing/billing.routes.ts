import { Router } from 'express'
import { z } from 'zod'
import { makeRateLimit } from '../../middleware/rateLimit'
import { BILL_TYPES } from './bill.model'
import { asyncHandler } from '../../utils/asyncHandler'
import { authenticate } from '../../middleware/authenticate'
import { permit } from '../../middleware/authorize'
import { validate } from '../../middleware/validate'
import * as billingService from './billing.service'

export const billingRouter = Router()

const createBillSchema = z.object({
  orderId: z.string(),
  type:    z.enum(BILL_TYPES),
})

const rawBillPasswordSchema = z.object({
  password: z.string().min(1),
})

const rawBillRateLimit = makeRateLimit({
  max: 10,
  message: 'Too many attempts. Please try again later.',
})

billingRouter.post('/',
  authenticate,
  permit('billing', 'create'),
  validate(createBillSchema),
  asyncHandler(async (req, res) => {
    const bill = await billingService.createBill({ ...req.body, createdBy: req.user._id })
    res.status(201).json(bill)
  })
)

billingRouter.get('/order/:orderId',
  authenticate,
  permit('billing', 'read'),
  asyncHandler(async (req, res) => {
    const bills = await billingService.listBillsForOrder(req.params.orderId)
    res.json(bills)
  })
)

billingRouter.get('/:id',
  authenticate,
  permit('billing', 'read'),
  asyncHandler(async (req, res) => {
    const bill = await billingService.getBillById(req.params.id)
    res.json(bill)
  })
)

billingRouter.post('/:id/download',
  authenticate,
  permit('billing', 'read'),
  rawBillRateLimit,
  validate(rawBillPasswordSchema),
  asyncHandler(async (req, res) => {
    const bill = await billingService.verifyRawBillAccess(req.params.id, req.body.password)
    res.json(bill)
  })
)
