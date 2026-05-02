import mongoose, { Schema, Document, Types } from 'mongoose'

export interface IDiscountLog extends Document {
  orderId:     Types.ObjectId
  discountId:  Types.ObjectId
  name:        string
  type:        string
  value:       number
  amountSaved: number
  appliedBy:   string
  appliedAt:   Date
}

const discountLogSchema = new Schema<IDiscountLog>(
  {
    orderId:     { type: Schema.Types.ObjectId, ref: 'Order', required: true },
    discountId:  { type: Schema.Types.ObjectId, ref: 'Discount', required: true },
    name:        { type: String, required: true },
    type:        { type: String, required: true },
    value:       { type: Number, required: true },
    amountSaved: { type: Number, required: true },
    appliedBy:   { type: String, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
)

discountLogSchema.index({ orderId: 1 })
discountLogSchema.index({ appliedBy: 1, appliedAt: -1 })

export const DiscountLog = mongoose.model<IDiscountLog>('DiscountLog', discountLogSchema)
