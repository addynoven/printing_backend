import { Payment, PaymentType, PaymentMethod, PaymentStatus } from './payment.model'
import { logActivity } from '../audit/activity-log.service'
import { NotFoundError } from '../../utils/AppError'
import { PaginationParams } from '../../utils/pagination'

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

export interface ListPaymentsQuery {
  orderId?:    string
  status?:     PaymentStatus
  method?:     PaymentMethod
  type?:       PaymentType
  from?:       string
  to?:         string
  pagination?: PaginationParams
}

export async function createPayment(data: CreatePaymentInput) {
  const payment = await Payment.create({ ...data, status: 'completed', paidAt: new Date() })
  await logActivity({ userId: data.collectedBy, action: 'payment_collect', resource: 'payment', resourceId: payment._id.toString(), details: { amount: data.amount, method: data.method, orderId: data.orderId } })
  return payment
}

export async function listPayments(query: ListPaymentsQuery = {}) {
  const filter: Record<string, unknown> = {}
  if (query.orderId) filter.orderId = query.orderId
  if (query.status)  filter.status  = query.status
  if (query.method)  filter.method  = query.method
  if (query.type)    filter.type    = query.type

  if (query.from || query.to) {
    const dateFilter: Record<string, Date> = {}
    if (query.from) dateFilter.$gte = new Date(query.from)
    if (query.to)   dateFilter.$lte = new Date(query.to)
    filter.paidAt = dateFilter
  }

  const p = query.pagination
  const cursor = p
    ? Payment.find(filter).sort({ paidAt: -1 }).skip(p.skip).limit(p.limit)
    : Payment.find(filter)
  const payments = await cursor.lean()
  const total = p ? await Payment.countDocuments(filter) : payments.length
  return {
    payments,
    total,
    page:  p?.page  ?? 1,
    limit: p?.limit ?? payments.length,
    pages: p ? Math.max(1, Math.ceil(total / p.limit)) : 1,
  }
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
