import mongoose, { Schema, Document } from 'mongoose'
import { LOYALTY_TIERS } from '../customers/customer.model'

export interface ILoyaltyTierConfig extends Document {
  tier:        typeof LOYALTY_TIERS[number]
  minSpend:    number
  minVisits:   number
  discountPct: number
  isActive:    boolean
  updatedAt:   Date
}

const loyaltyTierSchema = new Schema<ILoyaltyTierConfig>(
  {
    tier:        { type: String, enum: LOYALTY_TIERS, required: true, unique: true },
    minSpend:    { type: Number, required: true, min: 0 },
    minVisits:   { type: Number, required: true, min: 0 },
    discountPct: { type: Number, required: true, min: 0, max: 100 },
    isActive:    { type: Boolean, default: true },
  },
  { timestamps: { createdAt: false, updatedAt: true } }
)

export const LoyaltyTierConfig = mongoose.model<ILoyaltyTierConfig>('LoyaltyTierConfig', loyaltyTierSchema)
