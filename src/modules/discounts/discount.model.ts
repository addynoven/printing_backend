import mongoose, { Schema, Document } from 'mongoose'

export const DISCOUNT_TYPES = ['percentage', 'fixed'] as const
export const DISCOUNT_SCOPES = ['normal', 'loyal', 'all'] as const
export type DiscountType = typeof DISCOUNT_TYPES[number]
export type DiscountScope = typeof DISCOUNT_SCOPES[number]

export interface IDiscount extends Document {
  name:        string
  type:        DiscountType
  value:       number
  scope:       DiscountScope
  minOrderValue?: number
  maxDiscount?:   number
  isActive:    boolean
  createdBy:   string
  createdAt:   Date
  updatedAt:   Date
}

const discountSchema = new Schema<IDiscount>(
  {
    name:         { type: String, required: true, trim: true },
    type:         { type: String, enum: DISCOUNT_TYPES, required: true },
    value:        { type: Number, required: true, min: 0 },
    scope:        { type: String, enum: DISCOUNT_SCOPES, default: 'all' },
    minOrderValue:{ type: Number, min: 0 },
    maxDiscount:  { type: Number, min: 0 },
    isActive:     { type: Boolean, default: true },
    createdBy:    { type: String, required: true },
  },
  { timestamps: true }
)

discountSchema.index({ isActive: 1, scope: 1 })

export const Discount = mongoose.model<IDiscount>('Discount', discountSchema)
