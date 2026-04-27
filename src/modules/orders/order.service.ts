import { Types } from 'mongoose'
import { Order, IOrder, OrderStatus, JobType, Priority } from './order.model'
import { NotFoundError } from '../../utils/AppError'
import { transitionOrder } from './order.statemachine'

export interface ListOrdersQuery {
  status?:      OrderStatus
  jobType?:     JobType
  priority?:    Priority
  from?:        string
  to?:          string
  ownerId?:     string
}

export interface CreateOrderInput {
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

  const orders = await Order.find(filter).sort({ createdAt: -1 }).lean()
  return { orders, total: orders.length }
}

export async function createOrder(data: CreateOrderInput): Promise<IOrder> {
  const order = await Order.create({
    ...data,
    createdBy: new Types.ObjectId(data.createdBy),
    status: 'draft',
    statusHistory: [{
      status:    'draft',
      changedBy: new Types.ObjectId(data.createdBy),
      at:        new Date(),
    }],
  })
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
