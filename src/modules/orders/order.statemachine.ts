import { Types } from 'mongoose'
import { Order, IOrder, OrderStatus } from './order.model'
import { ValidationError } from '../../utils/AppError'

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

// Hooks stubbed — wired up when tasks/inventory/barcode modules are built
async function autoAssignTask(_order: IOrder): Promise<void> {}
async function deductInventory(_order: IOrder): Promise<void> {}
async function generateFinalBarcode(_order: IOrder): Promise<void> {}
async function reverseInventoryIfDeducted(_order: IOrder): Promise<void> {}

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

  for (const hook of HOOKS[newStatus] ?? []) {
    await hook(order)
  }

  return order
}
