import { Types } from 'mongoose'
import { Order, IOrder, OrderStatus, JobType, Priority } from './order.model'
import { Customer } from '../customers/customer.model'
import { applyCoupon } from '../loyalty/loyalty.service'
import { logActivity } from '../audit/activity-log.service'
import { logger } from '../../utils/logger'
import { NotFoundError } from '../../utils/AppError'
import { transitionOrder } from './order.statemachine'
import { PaginationParams } from '../../utils/pagination'

export interface ListOrdersQuery {
  status?:      OrderStatus
  jobType?:     JobType
  priority?:    Priority
  from?:        string
  to?:          string
  ownerId?:     string
  q?:           string
  pagination?:  PaginationParams
}

export interface CreateOrderInput {
  customerId?:   string
  customer: { name: string; phone: string; email?: string }
  jobType:  JobType
  items:    Array<{ description: string; quantity: number; unit: string; unitPrice: number }>
  bom?:     Array<{ materialId: string; name?: string; unit?: string; qty: number }>
  rawCost:       number
  taxableValue:  number
  billSplitPct:  number
  hsnCode?:      string
  priority?:     Priority
  deadline?:     string
  notes?:        string
  discountAmount?: number
  appliedDiscountId?: string
  couponCode?:   string
  createdBy:     string
}

export interface UpdateOrderInput {
  customer?: { name?: string; phone?: string; email?: string }
  rawCost?:      number
  taxableValue?: number
  billSplitPct?: number
  hsnCode?:      string
  priority?:     Priority
  deadline?:     string
  notes?:        string
  discountAmount?: number
  appliedDiscountId?: string
}

export async function listOrders(query: ListOrdersQuery) {
  const filter: Record<string, unknown> = {}

  if (query.status)   filter.status   = query.status
  if (query.jobType)  filter.jobType  = query.jobType
  if (query.priority) filter.priority = query.priority

  if (query.from || query.to) {
    const dateFilter: Record<string, Date> = {}
    if (query.from) dateFilter.$gte = new Date(query.from)
    if (query.to)   dateFilter.$lte = new Date(query.to)
    filter.createdAt = dateFilter
  }

  if (query.ownerId) {
    filter.$or = [
      { createdBy:  new Types.ObjectId(query.ownerId) },
      { assignedTo: new Types.ObjectId(query.ownerId) },
    ]
  }

  if (query.q) {
    const q = query.q.trim()
    if (q) {
      filter.$or = [
        { orderNumber: { $regex: q, $options: 'i' } },
        { 'customer.name': { $regex: q, $options: 'i' } },
        { 'customer.phone': { $regex: q, $options: 'i' } },
      ]
    }
  }

  const p = query.pagination
  const cursor = Order.find(filter).sort({ createdAt: -1 })
  if (p) cursor.skip(p.skip).limit(p.limit)

  const orders = await cursor.lean()
  const total  = p ? await Order.countDocuments(filter) : orders.length
  return {
    orders,
    total,
    page:  p?.page  ?? 1,
    limit: p?.limit ?? orders.length,
    pages: p ? Math.max(1, Math.ceil(total / p.limit)) : 1,
  }
}

export async function createOrder(data: CreateOrderInput): Promise<IOrder> {
  let customerId = data.customerId

  if (!customerId && data.customer?.phone) {
    let customer = await Customer.findOne({ phone: data.customer.phone })
    if (!customer) {
      customer = await Customer.create({
        name: data.customer.name,
        phone: data.customer.phone,
        email: data.customer.email,
      })
    }
    customerId = customer._id.toString()
  }

  const { couponCode, ...rest } = data
  const payload: Record<string, unknown> = {
    ...rest,
    createdBy: new Types.ObjectId(data.createdBy),
    status: 'draft',
    statusHistory: [{
      status:    'draft',
      changedBy: new Types.ObjectId(data.createdBy),
      at:        new Date(),
    }],
  }
  if (customerId) payload.customerId = new Types.ObjectId(customerId)
  if (data.appliedDiscountId) payload.appliedDiscountId = new Types.ObjectId(data.appliedDiscountId)

  const order = await Order.create(payload)

  if (couponCode) {
    try {
      const subtotal = order.rawCost + order.taxableValue
      const { discount } = await applyCoupon(couponCode, order._id.toString(), subtotal)
      order.discountAmount     = (order.discountAmount ?? 0) + discount
      order.appliedCouponCode  = couponCode.toUpperCase()
      await order.save()
      await logActivity({
        userId:     data.createdBy,
        action:     'discount_apply',
        resource:   'orders',
        resourceId: order._id.toString(),
        details:    { couponCode: couponCode.toUpperCase(), discount },
      })
    } catch (err) {
      // Roll the order back so the coupon failure isn't silently absorbed
      await Order.deleteOne({ _id: order._id })
      logger.warn('Order rolled back due to coupon failure', {
        orderId: order._id.toString(),
        couponCode,
        error:   err instanceof Error ? err.message : String(err),
      })
      throw err
    }
  }

  return order
}

export async function getOrderById(id: string) {
  const order = await Order.findById(id).lean()
  if (!order) throw new NotFoundError('Order not found')
  return order
}

export async function updateOrder(id: string, data: UpdateOrderInput) {
  const order = await Order.findByIdAndUpdate(id, data, { new: true, runValidators: true }).lean()
  if (!order) throw new NotFoundError('Order not found')
  return order
}

export async function setOrderStatus(
  orderId: string,
  newStatus: OrderStatus,
  actorId: string,
  note?: string
) {
  return transitionOrder(orderId, newStatus, actorId, note)
}

export async function getTimeline(id: string) {
  const order = await Order.findById(id).select('orderNumber status statusHistory').lean()
  if (!order) throw new NotFoundError('Order not found')
  return order.statusHistory
}
