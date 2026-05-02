import mongoose, { Schema, Document } from 'mongoose'

export const LOYALTY_TIERS = ['bronze', 'silver', 'gold', 'platinum'] as const
export type LoyaltyTier = typeof LOYALTY_TIERS[number]

export interface ICustomer extends Document {
  name:       string
  phone:      string
  email?:     string
  visitCount: number
  totalSpend: number
  lastVisit:  Date
  loyaltyTier: LoyaltyTier
  isActive:   boolean
  createdAt:  Date
  updatedAt:  Date
}

const customerSchema = new Schema<ICustomer>(
  {
    name:        { type: String, required: true, trim: true },
    phone:       { type: String, required: true, unique: true, trim: true },
    email:       { type: String, trim: true },
    visitCount:  { type: Number, default: 0 },
    totalSpend:  { type: Number, default: 0 },
    lastVisit:   { type: Date },
    loyaltyTier: { type: String, enum: LOYALTY_TIERS, default: 'bronze' },
    isActive:    { type: Boolean, default: true },
  },
  { timestamps: true }
)

customerSchema.index({ phone: 1 })
customerSchema.index({ loyaltyTier: 1 })

export const Customer = mongoose.model<ICustomer>('Customer', customerSchema)
