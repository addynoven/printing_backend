import { Types } from 'mongoose'
import { Order, IOrder, OrderStatus } from './order.model'
import { ValidationError } from '../../utils/AppError'
import { logger } from '../../utils/logger'
import {
  autoAssignTask,
  deductInventory,
  generateFinalBarcode,
  reverseInventoryIfDeducted,
} from './order.hooks'

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

const HOOKS: Partial<Record<OrderStatus, Array<(order: IOrder) => Promise<void>>>> = {
  confirmed:  [autoAssignTask],
  completed:  [deductInventory, generateFinalBarcode],
  cancelled:  [reverseInventoryIfDeducted],
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

  order.status = newStatus
  order.statusHistory.push({
    status:    newStatus,
    changedBy: new Types.ObjectId(actorId.toString()),
    note,
    at:        new Date(),
  })

  await order.save()

  // Hooks run after the transition is persisted. Failures are logged but do
  // not roll back the status change — the transition is the source of truth.
  for (const hook of HOOKS[newStatus] ?? []) {
    try {
      await hook(order)
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
