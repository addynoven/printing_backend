import { Router } from 'express'
import { z } from 'zod'
import { DISCOUNT_TYPES, DISCOUNT_SCOPES } from './discount.model'
import { asyncHandler } from '../../utils/asyncHandler'
import { authenticate } from '../../middleware/authenticate'
import { permit } from '../../middleware/authorize'
import { validate } from '../../middleware/validate'
import * as discountService from './discount.service'
import { logActivity } from '../audit/activity-log.service'

export const discountRouter = Router()

const createSchema = z.object({
  name:         z.string().min(1),
  type:         z.enum(DISCOUNT_TYPES),
  value:        z.number().positive(),
  scope:        z.enum(DISCOUNT_SCOPES).optional(),
  minOrderValue:z.number().positive().optional(),
  maxDiscount:  z.number().positive().optional(),
})

const updateSchema = z.object({
  name:         z.string().min(1).optional(),
  type:         z.enum(DISCOUNT_TYPES).optional(),
  value:        z.number().positive().optional(),
  scope:        z.enum(DISCOUNT_SCOPES).optional(),
  minOrderValue:z.number().positive().optional(),
  maxDiscount:  z.number().positive().optional(),
  isActive:     z.boolean().optional(),
})

discountRouter.get('/',
  authenticate,
  permit('discounts', 'read'),
  asyncHandler(async (req, res) => {
    const scope = req.query.scope as discountService.CreateDiscountInput['scope']
    const result = await discountService.listDiscounts(scope)
    res.json(result)
  })
)

discountRouter.post('/',
  authenticate,
  permit('discounts', 'create'),
  validate(createSchema),
  asyncHandler(async (req, res) => {
    const discount = await discountService.createDiscount({ ...req.body, createdBy: req.user._id })
    await logActivity({ userId: req.user._id, action: 'create', resource: 'discounts', resourceId: discount._id.toString(), details: { name: discount.name, type: discount.type, value: discount.value } })
    res.status(201).json(discount)
  })
)

discountRouter.get('/:id',
  authenticate,
  permit('discounts', 'read'),
  asyncHandler(async (req, res) => {
    const discount = await discountService.getDiscountById(req.params.id)
    res.json(discount)
  })
)

discountRouter.patch('/:id',
  authenticate,
  permit('discounts', 'update'),
  validate(updateSchema),
  asyncHandler(async (req, res) => {
    const discount = await discountService.updateDiscount(req.params.id, req.body)
    await logActivity({ userId: req.user._id, action: 'update', resource: 'discounts', resourceId: req.params.id, details: req.body })
    res.json(discount)
  })
)

discountRouter.delete('/:id',
  authenticate,
  permit('discounts', 'delete'),
  asyncHandler(async (req, res) => {
    await discountService.deleteDiscount(req.params.id)
    await logActivity({ userId: req.user._id, action: 'delete', resource: 'discounts', resourceId: req.params.id })
    res.status(204).send()
  })
)

discountRouter.get('/logs/order/:orderId',
  authenticate,
  permit('discounts', 'read'),
  asyncHandler(async (req, res) => {
    const logs = await discountService.getDiscountLogsForOrder(req.params.orderId)
    res.json(logs)
  })
)
