import { Types } from 'mongoose'
import { Order, IOrder, OrderStatus } from './order.model'
import { Customer } from '../customers/customer.model'
import { logActivity } from '../audit/activity-log.service'
import { ValidationError } from '../../utils/AppError'
import { autoAssignTask } from '../tasks/task.assigner'
import { deductForOrder, reverseOrderDeductions } from '../inventory/inventory.service'
import { generateBarcode } from '../barcode/barcode.service'

const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  draft:         ['confirmed', 'cancelled'],
  confirmed:     ['designing', 'cancelled'],
  designing:     ['in_production', 'cancelled'],
  in_production: ['finishing'],
  finishing:     ['completed'],
  completed:     ['invoiced'],
  invoiced:      [],
  cancelled:     [],
}

async function generateFinalBarcode(order: IOrder): Promise<void> {
  await generateBarcode(order._id.toString(), 'final')
}

async function updateCustomerOnCompletion(order: IOrder): Promise<void> {
  if (!order.customerId) return
  const customer = await Customer.findById(order.customerId)
  if (!customer) return

  const orderTotal = order.rawCost + order.taxableValue
  customer.visitCount += 1
  customer.totalSpend += orderTotal
  customer.lastVisit = new Date()

  if (customer.totalSpend >= 50000 && customer.visitCount >= 20) {
    customer.loyaltyTier = 'platinum'
  } else if (customer.totalSpend >= 25000 && customer.visitCount >= 10) {
    customer.loyaltyTier = 'gold'
  } else if (customer.totalSpend >= 10000 && customer.visitCount >= 5) {
    customer.loyaltyTier = 'silver'
  }

  await customer.save()
}

const HOOKS: Partial<Record<OrderStatus, Array<(order: IOrder, actorId: string) => Promise<void>>>> = {
  confirmed: [autoAssignTask],
  completed: [
    (order) => deductForOrder(order, order.createdBy),
    generateFinalBarcode,
    updateCustomerOnCompletion,
  ],
  cancelled: [
    (order, actorId) => reverseOrderDeductions(order, actorId),
  ],
}

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false
}

export async function transitionOrder(
  orderId: string,
  newStatus: OrderStatus,
  actorId: string | Types.ObjectId,
  note?: string
): Promise<IOrder> {
  const order = await Order.findById(orderId)
  if (!order) {
    const { NotFoundError } = await import('../../utils/AppError')
    throw new NotFoundError('Order not found')
  }

  if (!canTransition(order.status, newStatus)) {
    throw new ValidationError(`Invalid transition: ${order.status} → ${newStatus}`)
  }

  const previousStatus = order.status
  order.status = newStatus
  order.statusHistory.push({
    status:    newStatus,
    changedBy: new Types.ObjectId(actorId.toString()),
    note,
    at:        new Date(),
  })

  await order.save()

  await logActivity({
    userId: actorId.toString(),
    action: 'status_change',
    resource: 'order',
    resourceId: order._id.toString(),
    details: { from: previousStatus, to: newStatus, note },
  })

  for (const hook of HOOKS[newStatus] ?? []) {
    await hook(order, actorId.toString())
  }

  return order
}
