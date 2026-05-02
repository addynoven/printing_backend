import { Payment, PaymentType, PaymentMethod } from './payment.model'
import { logActivity } from '../audit/activity-log.service'
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
  const payment = await Payment.create({ ...data, status: 'completed', paidAt: new Date() })
  await logActivity({ userId: data.collectedBy, action: 'payment_collect', resource: 'payment', resourceId: payment._id.toString(), details: { amount: data.amount, method: data.method, orderId: data.orderId } })
  return payment
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
