import crypto from 'crypto'
import { Bill, BillType } from './bill.model'
import { Order } from '../orders/order.model'
import { env } from '../../config/env'
import { logActivity } from '../audit/activity-log.service'
import { NotFoundError, ForbiddenError } from '../../utils/AppError'

export interface CreateBillInput {
  orderId:   string
  type:      BillType
  createdBy: string
}

const GST_RATE = 0.09

export async function createBill(data: CreateBillInput) {
  const order = await Order.findById(data.orderId).lean()
  if (!order) throw new NotFoundError('Order not found')

  const year   = new Date().getFullYear()
  const prefix = data.type === 'raw' ? 'RAW' : 'TAX'
  const count  = await Bill.countDocuments({ type: data.type })
  const seriesNumber = `${prefix}-${year}-${String(count + 1).padStart(3, '0')}`

  const lineItems = order.items.map(item => ({
    description: item.description,
    qty:         item.quantity,
    rate:        item.unitPrice,
    amount:      item.quantity * item.unitPrice,
  }))

  const discountAmount = order.discountAmount ?? 0

  if (data.type === 'raw') {
    const bill = await Bill.create({
      orderId:      data.orderId,
      type:         'raw',
      seriesNumber,
      amount:       order.rawCost,
      discountAmount,
      isProtected:  true,
      lineItems,
      createdBy:    data.createdBy,
    })
    await logActivity({ userId: data.createdBy, action: 'create', resource: 'bill', resourceId: bill._id.toString(), details: { type: 'raw', orderId: data.orderId } })
    return bill
  }

  const taxableAmount = Math.max(0, order.taxableValue - discountAmount)
  const cgst = Math.round(taxableAmount * GST_RATE)
  const sgst = Math.round(taxableAmount * GST_RATE)

  const bill = await Bill.create({
    orderId:      data.orderId,
    type:         'gst',
    seriesNumber,
    amount:       order.taxableValue,
    discountAmount,
    isProtected:  false,
    lineItems,
    taxableAmount,
    cgst,
    sgst,
    totalAmount:  taxableAmount + cgst + sgst,
    createdBy:    data.createdBy,
  })
  await logActivity({ userId: data.createdBy, action: 'create', resource: 'bill', resourceId: bill._id.toString(), details: { type: 'gst', orderId: data.orderId } })
  return bill
}

export async function getBillById(id: string) {
  const bill = await Bill.findById(id).lean()
  if (!bill) throw new NotFoundError('Bill not found')
  return bill
}

export async function listBillsForOrder(orderId: string) {
  const bills = await Bill.find({ orderId }).lean()
  return { bills, total: bills.length }
}

export async function verifyRawBillAccess(billId: string, password: string) {
  const bill = await Bill.findById(billId).lean()
  if (!bill) throw new NotFoundError('Bill not found')
  if (bill.type !== 'raw') return bill

  const a = Buffer.from(password)
  const b = Buffer.from(env.RAW_BILL_PASSWORD)
  if (a.length !== b.length) {
    throw new ForbiddenError('Invalid password')
  }
  if (!crypto.timingSafeEqual(a, b)) {
    throw new ForbiddenError('Invalid password')
  }
  return bill
}
