import { Router } from 'express'
import { z } from 'zod'
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
