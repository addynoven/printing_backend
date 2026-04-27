import { Payment, PaymentType, PaymentMethod } from './payment.model'
import { NotFoundError } from '../../utils/AppError'

export interface CreatePaymentInput {
  orderId:      string
  billId?:      string
  type:         PaymentType
  amount:       number
  method:       PaymentMethod
  referenceId?: string
  notes?:       string
  collectedBy:  string
}

export async function createPayment(data: CreatePaymentInput) {
  return await Payment.create({ ...data, status: 'completed', paidAt: new Date() })
}

export async function listPayments() {
  const payments = await Payment.find({}).lean()
  return { payments, total: payments.length }
}

export async function getPaymentsForOrder(orderId: string) {
  const payments = await Payment.find({ orderId }).lean()
  return { payments, total: payments.length }
}

export async function refundPayment(id: string) {
  const doc = await Payment.findByIdAndUpdate(id, { status: 'refunded' }, { new: true }).lean()
  if (!doc) throw new NotFoundError('Payment not found')
  return doc
}
