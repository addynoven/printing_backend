import { Bill, BillType } from './bill.model'
import { Order } from '../orders/order.model'
import { NotFoundError } from '../../utils/AppError'

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

  if (data.type === 'raw') {
    return await Bill.create({
      orderId:      data.orderId,
      type:         'raw',
      seriesNumber,
      amount:       order.rawCost,
      isProtected:  true,
      lineItems,
      createdBy:    data.createdBy,
    })
  }

  const taxableAmount = order.taxableValue
  const cgst = Math.round(taxableAmount * GST_RATE)
  const sgst = Math.round(taxableAmount * GST_RATE)

  return await Bill.create({
    orderId:      data.orderId,
    type:         'gst',
    seriesNumber,
    amount:       taxableAmount,
    isProtected:  false,
    lineItems,
    taxableAmount,
    cgst,
    sgst,
    totalAmount:  taxableAmount + cgst + sgst,
    createdBy:    data.createdBy,
  })
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
