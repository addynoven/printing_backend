import { Coupon } from './coupon.model'
import { LoyaltyTierConfig } from './loyalty-tier.model'
import { Customer } from '../customers/customer.model'
import { NotFoundError, BadRequestError } from '../../utils/AppError'

export interface CreateCouponInput {
  code:        string
  customerId:  string
  type:        'percentage' | 'fixed'
  value:       number
  maxDiscount?: number
  minOrderValue?: number
  expiresAt:   Date
}

export interface UpdateTierInput {
  minSpend:    number
  minVisits:   number
  discountPct: number
  isActive?:   boolean
}

export async function getTierConfig(tier: string) {
  const config = await LoyaltyTierConfig.findOne({ tier }).lean()
  if (!config) throw new NotFoundError('Tier config not found')
  return config
}

export async function listTierConfigs() {
  const configs = await LoyaltyTierConfig.find().sort({ minSpend: 1 }).lean()
  return { configs, total: configs.length }
}

export async function upsertTierConfig(tier: string, data: UpdateTierInput) {
  const config = await LoyaltyTierConfig.findOneAndUpdate(
    { tier },
    { ...data, tier },
    { new: true, upsert: true, runValidators: true }
  )
  return config
}

export async function createCoupon(data: CreateCouponInput) {
  const customer = await Customer.findById(data.customerId)
  if (!customer) throw new NotFoundError('Customer not found')

  const existing = await Coupon.findOne({ code: data.code.toUpperCase() })
  if (existing) throw new BadRequestError('Coupon code already exists')

  const coupon = await Coupon.create({
    ...data,
    code: data.code.toUpperCase(),
  })
  return coupon
}

export async function listCouponsForCustomer(customerId: string) {
  const coupons = await Coupon.find({ customerId, status: 'active' })
    .sort({ expiresAt: 1 })
    .lean()
  return { coupons, total: coupons.length }
}

export async function listAllCoupons(query: { status?: string; customerId?: string }) {
  const filter: Record<string, unknown> = {}
  if (query.status) filter.status = query.status
  if (query.customerId) filter.customerId = query.customerId

  const coupons = await Coupon.find(filter).sort({ createdAt: -1 }).lean()
  return { coupons, total: coupons.length }
}

export async function applyCoupon(code: string, orderId: string, orderTotal: number) {
  const coupon = await Coupon.findOne({ code: code.toUpperCase() })
  if (!coupon) throw new NotFoundError('Coupon not found')
  if (coupon.status !== 'active') throw new BadRequestError('Coupon is not active')
  if (coupon.expiresAt < new Date()) throw new BadRequestError('Coupon has expired')
  if (coupon.minOrderValue && orderTotal < coupon.minOrderValue) {
    throw new BadRequestError(`Minimum order value of ${coupon.minOrderValue} required`)
  }

  let discount = 0
  if (coupon.type === 'percentage') {
    discount = Math.round(orderTotal * (coupon.value / 100))
    if (coupon.maxDiscount && discount > coupon.maxDiscount) {
      discount = coupon.maxDiscount
    }
  } else {
    discount = coupon.value
  }

  discount = Math.min(discount, orderTotal)

  coupon.status = 'used'
  coupon.usedAt = new Date()
  coupon.usedOnOrderId = orderId as unknown as import('mongoose').Types.ObjectId
  await coupon.save()

  return { coupon, discount }
}

export async function getCustomerLoyaltySummary(customerId: string) {
  const customer = await Customer.findById(customerId).lean()
  if (!customer) throw new NotFoundError('Customer not found')

  const tier = await LoyaltyTierConfig.findOne({ tier: customer.loyaltyTier }).lean()
  const activeCoupons = await Coupon.countDocuments({ customerId, status: 'active', expiresAt: { $gte: new Date() } })

  return {
    customer,
    tier,
    activeCoupons,
    nextTier: await getNextTier(customer.loyaltyTier),
  }
}

async function getNextTier(currentTier: string) {
  const tiers = ['bronze', 'silver', 'gold', 'platinum']
  const idx = tiers.indexOf(currentTier)
  if (idx === -1 || idx === tiers.length - 1) return null
  return LoyaltyTierConfig.findOne({ tier: tiers[idx + 1] }).lean()
}
