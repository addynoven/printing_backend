import mongoose, { Types } from 'mongoose'
import * as QRCode from 'qrcode'
import { IOrder } from './order.model'
import { Task } from '../tasks/task.model'
import { Material, StockLedger } from '../inventory/material.model'
import { Barcode } from '../barcode/barcode.model'
import { Notification } from '../notifications/notification.model'
import { User } from '../auth/auth.model'
import { logger } from '../../utils/logger'

export async function autoAssignTask(order: IOrder): Promise<void> {
  const orderId = order._id as Types.ObjectId

  const taskData: Record<string, unknown> = {
    orderId,
    type:     order.jobType,
    priority: order.priority,
    status:   order.assignedTo ? 'assigned' : 'unassigned',
  }
  if (order.assignedTo) taskData.assignedTo = order.assignedTo

  const task = await Task.create(taskData)

  if (order.assignedTo) {
    await User.findByIdAndUpdate(order.assignedTo, {
      $inc: { activeTaskCount: 1 },
      $set: { lastAssignedAt: new Date() },
    })
    await Notification.create({
      userId:       order.assignedTo,
      type:         'task_assigned',
      title:        'New task assigned',
      message:      `Task for order ${order.orderNumber} (${order.jobType}) has been assigned to you.`,
      resourceId:   task._id,
      resourceType: 'task',
    })
  }
}

export async function deductInventory(order: IOrder): Promise<void> {
  if (!order.bom?.length) return

  const session = await mongoose.startSession()
  session.startTransaction()
  try {
    for (const entry of order.bom) {
      const material = await Material.findById(entry.materialId).session(session)
      if (!material) {
        logger.warn(`Material ${entry.materialId} not found for order ${order._id}; skipping deduct`)
        continue
      }
      material.stock = Math.max(0, material.stock - entry.qty)
      await material.save({ session })

      await StockLedger.create([{
        materialId:   entry.materialId,
        orderId:      order._id,
        type:         'DEDUCT',
        qty:          -entry.qty,
        balanceAfter: material.stock,
        note:         `Auto-deducted on order completion (${order.orderNumber})`,
        performedBy:  order.createdBy,
      }], { session })

      if (material.stock <= material.threshold) {
        await Notification.create([{
          userId:       order.createdBy,
          type:         'low_stock',
          title:        'Low stock alert',
          message:      `Material "${material.name}" is at or below threshold (${material.stock}/${material.threshold}).`,
          resourceId:   material._id,
          resourceType: 'material',
        }], { session })
      }
    }
    await session.commitTransaction()
  } catch (err) {
    await session.abortTransaction()
    throw err
  } finally {
    session.endSession()
  }
}

export async function generateFinalBarcode(order: IOrder): Promise<void> {
  const orderId   = (order._id as Types.ObjectId).toString()
  const qrDataUrl = await QRCode.toDataURL(orderId)
  await Barcode.create({
    orderId,
    code:      orderId,
    qrDataUrl,
    type:      'final',
  })

  if (order.createdBy) {
    await Notification.create({
      userId:       order.createdBy,
      type:         'order_completed',
      title:        'Order completed',
      message:      `Order ${order.orderNumber} is complete. Final barcode generated.`,
      resourceId:   order._id,
      resourceType: 'order',
    })
  }
}

export async function reverseInventoryIfDeducted(order: IOrder): Promise<void> {
  const deductions = await StockLedger.find({ orderId: order._id, type: 'DEDUCT' })
  if (deductions.length === 0) return

  const session = await mongoose.startSession()
  session.startTransaction()
  try {
    for (const deduction of deductions) {
      const reverseQty = Math.abs(deduction.qty)
      const material   = await Material.findById(deduction.materialId).session(session)
      if (!material) continue

      material.stock += reverseQty
      await material.save({ session })

      await StockLedger.create([{
        materialId:   deduction.materialId,
        orderId:      order._id,
        type:         'REVERSAL',
        qty:          reverseQty,
        balanceAfter: material.stock,
        note:         `Reversed deduction for cancelled order (${order.orderNumber})`,
        performedBy:  order.createdBy,
      }], { session })
    }
    await session.commitTransaction()
  } catch (err) {
    await session.abortTransaction()
    throw err
  } finally {
    session.endSession()
  }
}
