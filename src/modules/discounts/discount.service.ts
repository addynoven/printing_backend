import { Discount, DiscountType, DiscountScope } from './discount.model'
import { DiscountLog } from './discount-log.model'
import { logActivity } from '../audit/activity-log.service'
import { NotFoundError, BadRequestError } from '../../utils/AppError'

export interface CreateDiscountInput {
  name:         string
  type:         DiscountType
  value:        number
  scope?:       DiscountScope
  minOrderValue?: number
  maxDiscount?:   number
  createdBy:    string
}

export interface UpdateDiscountInput {
  name?:         string
  type?:         DiscountType
  value?:        number
  scope?:        DiscountScope
  minOrderValue?: number
  maxDiscount?:   number
  isActive?:     boolean
}

export async function listDiscounts(scope?: DiscountScope) {
  const filter: Record<string, unknown> = { isActive: true }
  if (scope) filter.scope = { $in: [scope, 'all'] }
  const discounts = await Discount.find(filter).sort({ createdAt: -1 }).lean()
  return { discounts, total: discounts.length }
}

export async function createDiscount(data: CreateDiscountInput) {
  if (data.type === 'percentage' && data.value > 100) {
    throw new BadRequestError('Percentage discount cannot exceed 100%')
  }
  const discount = await Discount.create(data)
  return discount
}

export async function getDiscountById(id: string) {
  const discount = await Discount.findById(id).lean()
  if (!discount) throw new NotFoundError('Discount not found')
  return discount
}

export async function updateDiscount(id: string, data: UpdateDiscountInput) {
  if (data.type === 'percentage' && data.value !== undefined && data.value > 100) {
    throw new BadRequestError('Percentage discount cannot exceed 100%')
  }
  const discount = await Discount.findByIdAndUpdate(id, data, { new: true, runValidators: true }).lean()
  if (!discount) throw new NotFoundError('Discount not found')
  return discount
}

export async function deleteDiscount(id: string) {
  const discount = await Discount.findByIdAndUpdate(id, { isActive: false }, { new: true }).lean()
  if (!discount) throw new NotFoundError('Discount not found')
  return discount
}

export function calculateDiscountAmount(
  subtotal: number,
  discount: { type: DiscountType; value: number; maxDiscount?: number | null; minOrderValue?: number | null }
): number {
  if (discount.minOrderValue && subtotal < discount.minOrderValue) return 0

  let amount = 0
  if (discount.type === 'percentage') {
    amount = Math.round(subtotal * (discount.value / 100))
  } else {
    amount = discount.value
  }

  if (discount.maxDiscount && amount > discount.maxDiscount) {
    amount = discount.maxDiscount
  }

  return Math.min(amount, subtotal)
}

export async function logDiscountApplication(data: {
  orderId: string
  discountId: string
  name: string
  type: string
  value: number
  amountSaved: number
  appliedBy: string
}) {
  await logActivity({
    userId: data.appliedBy,
    action: 'discount_apply',
    resource: 'discounts',
    resourceId: data.discountId,
    details: { orderId: data.orderId, name: data.name, amountSaved: data.amountSaved },
  })
  return await DiscountLog.create(data)
}

export async function getDiscountLogsForOrder(orderId: string) {
  const logs = await DiscountLog.find({ orderId }).sort({ appliedAt: -1 }).lean()
  return { logs, total: logs.length }
}
