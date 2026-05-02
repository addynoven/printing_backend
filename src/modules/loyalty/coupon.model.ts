import mongoose, { Schema, Document, Types } from 'mongoose'

export const COUPON_STATUSES = ['active', 'used', 'expired'] as const
export type CouponStatus = typeof COUPON_STATUSES[number]

export interface ICoupon extends Document {
  code:        string
  customerId:  Types.ObjectId
  type:        'percentage' | 'fixed'
  value:       number
  maxDiscount?: number
  minOrderValue?: number
  status:      CouponStatus
  expiresAt:   Date
  usedAt?:     Date
  usedOnOrderId?: Types.ObjectId
  createdAt:   Date
}

const couponSchema = new Schema<ICoupon>(
  {
    code:         { type: String, required: true, unique: true, uppercase: true, trim: true },
    customerId:   { type: Schema.Types.ObjectId, ref: 'Customer', required: true },
    type:         { type: String, enum: ['percentage', 'fixed'], required: true },
    value:        { type: Number, required: true, min: 0 },
    maxDiscount:  { type: Number, min: 0 },
    minOrderValue:{ type: Number, min: 0 },
    status:       { type: String, enum: COUPON_STATUSES, default: 'active' },
    expiresAt:    { type: Date, required: true },
    usedAt:       { type: Date },
    usedOnOrderId:{ type: Schema.Types.ObjectId, ref: 'Order' },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
)

couponSchema.index({ customerId: 1, status: 1 })
couponSchema.index({ code: 1 })
couponSchema.index({ expiresAt: 1 })

export const Coupon = mongoose.model<ICoupon>('Coupon', couponSchema)
