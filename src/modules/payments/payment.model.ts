import mongoose, { Schema, Document, Types } from 'mongoose'

export const PAYMENT_TYPES   = ['advance', 'final', 'partial'] as const
export const PAYMENT_METHODS = ['cash', 'upi', 'card'] as const
export const PAYMENT_STATUSES = ['pending', 'completed', 'refunded'] as const

export type PaymentType   = typeof PAYMENT_TYPES[number]
export type PaymentMethod = typeof PAYMENT_METHODS[number]
export type PaymentStatus = typeof PAYMENT_STATUSES[number]

export interface IPayment extends Document {
  orderId:     Types.ObjectId
  billId?:     Types.ObjectId
  type:        PaymentType
  amount:      number
  method:      PaymentMethod
  status:      PaymentStatus
  referenceId?: string
  collectedBy: Types.ObjectId
  paidAt:      Date
  notes?:      string
  createdAt:   Date
}

const paymentSchema = new Schema<IPayment>(
  {
    orderId:     { type: Schema.Types.ObjectId, ref: 'Order', required: true },
    billId:      { type: Schema.Types.ObjectId, ref: 'Bill' },
    type:        { type: String, enum: PAYMENT_TYPES, required: true },
    amount:      { type: Number, required: true, min: 0 },
    method:      { type: String, enum: PAYMENT_METHODS, required: true },
    status:      { type: String, enum: PAYMENT_STATUSES, default: 'completed' },
    referenceId: String,
    collectedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    paidAt:      { type: Date, default: Date.now },
    notes:       String,
  },
  { timestamps: { createdAt: true, updatedAt: false } }
)

paymentSchema.index({ orderId: 1 })
paymentSchema.index({ status: 1 })
paymentSchema.index({ paidAt: -1 })

export const Payment = mongoose.model<IPayment>('Payment', paymentSchema)
