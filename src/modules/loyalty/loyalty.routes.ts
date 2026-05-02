import { Router } from 'express'
import { z } from 'zod'
import { LOYALTY_TIERS } from '../customers/customer.model'
import { asyncHandler } from '../../utils/asyncHandler'
import { authenticate } from '../../middleware/authenticate'
import { permit } from '../../middleware/authorize'
import { validate } from '../../middleware/validate'
import * as loyaltyService from './loyalty.service'

export const loyaltyRouter = Router()

const tierSchema = z.object({
  minSpend:    z.number().min(0),
  minVisits:   z.number().min(0),
  discountPct: z.number().min(0).max(100),
  isActive:    z.boolean().optional(),
})

const couponSchema = z.object({
  code:         z.string().min(3),
  customerId:   z.string(),
  type:         z.enum(['percentage', 'fixed']),
  value:        z.number().positive(),
  maxDiscount:  z.number().positive().optional(),
  minOrderValue:z.number().positive().optional(),
  expiresAt:    z.string().datetime(),
})

loyaltyRouter.get('/tiers',
  authenticate,
  permit('loyalty', 'read'),
  asyncHandler(async (_req, res) => {
    const result = await loyaltyService.listTierConfigs()
    res.json(result)
  })
)

loyaltyRouter.put('/tiers/:tier',
  authenticate,
  permit('loyalty', 'update'),
  validate(tierSchema),
  asyncHandler(async (req, res) => {
    const tier = req.params.tier
    if (!LOYALTY_TIERS.includes(tier as typeof LOYALTY_TIERS[number])) {
      return res.status(400).json({ error: 'Invalid tier' })
    }
    const config = await loyaltyService.upsertTierConfig(tier as typeof LOYALTY_TIERS[number], req.body)
    res.json(config)
  })
)

loyaltyRouter.post('/coupons',
  authenticate,
  permit('loyalty', 'create'),
  validate(couponSchema),
  asyncHandler(async (req, res) => {
    const coupon = await loyaltyService.createCoupon(req.body)
    res.status(201).json(coupon)
  })
)

loyaltyRouter.get('/coupons',
  authenticate,
  permit('loyalty', 'read'),
  asyncHandler(async (req, res) => {
    const result = await loyaltyService.listAllCoupons({
      status: typeof req.query.status === 'string' ? req.query.status : undefined,
      customerId: typeof req.query.customerId === 'string' ? req.query.customerId : undefined,
    })
    res.json(result)
  })
)

loyaltyRouter.get('/customers/:customerId/coupons',
  authenticate,
  permit('loyalty', 'read'),
  asyncHandler(async (req, res) => {
    const result = await loyaltyService.listCouponsForCustomer(req.params.customerId)
    res.json(result)
  })
)

loyaltyRouter.get('/customers/:customerId/summary',
  authenticate,
  permit('loyalty', 'read'),
  asyncHandler(async (req, res) => {
    const summary = await loyaltyService.getCustomerLoyaltySummary(req.params.customerId)
    res.json(summary)
  })
)
