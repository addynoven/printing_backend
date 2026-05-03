import { Types } from 'mongoose'
import { Order, IOrder, OrderStatus } from './order.model'
import { logActivity } from '../audit/activity-log.service'
import { ValidationError } from '../../utils/AppError'
import { logger } from '../../utils/logger'
import { autoAssignTask } from '../tasks/task.assigner'
import { deductForOrder, reverseOrderDeductions } from '../inventory/inventory.service'
import { generateBarcode } from '../barcode/barcode.service'
import { updateCustomerStats } from '../customers/customer.service'

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
  await updateCustomerStats(order.customerId.toString(), order.rawCost + order.taxableValue)
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

  // Hooks run after the transition is persisted. Failures are logged but do
  // not roll back the status change — the transition is the source of truth.
  for (const hook of HOOKS[newStatus] ?? []) {
    try {
      await hook(order, actorId.toString())
    } catch (err) {
      logger.error('Order transition hook failed', {
        orderId:   orderId,
        newStatus,
        hook:      hook.name,
        error:     err instanceof Error ? err.message : String(err),
      })
    }
  }

  return order
}
