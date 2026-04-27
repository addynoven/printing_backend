import mongoose, { Schema, Document, Types } from 'mongoose'

export const BILL_TYPES = ['raw', 'gst'] as const
export type BillType = typeof BILL_TYPES[number]

export interface IBillLineItem {
  description: string
  qty:         number
  rate:        number
  amount:      number
}

export interface IBill extends Document {
  orderId:      Types.ObjectId
  type:         BillType
  seriesNumber: string
  amount:       number
  isProtected:  boolean
  pdfUrl?:      string
  lineItems:    IBillLineItem[]
  gstin?:       string
  hsnCode?:     string
  taxableAmount?: number
  cgst?:        number
  sgst?:        number
  totalAmount?: number
  createdBy:    Types.ObjectId
  createdAt:    Date
}

const billSchema = new Schema<IBill>(
  {
    orderId:      { type: Schema.Types.ObjectId, ref: 'Order', required: true },
    type:         { type: String, enum: BILL_TYPES, required: true },
    seriesNumber: { type: String, required: true, unique: true },
    amount:       { type: Number, required: true },
    isProtected:  { type: Boolean, default: false },
    pdfUrl:       String,
    lineItems: [{
      description: { type: String, required: true },
      qty:         { type: Number, required: true },
      rate:        { type: Number, required: true },
      amount:      { type: Number, required: true },
    }],
    gstin:        String,
    hsnCode:      String,
    taxableAmount: Number,
    cgst:         Number,
    sgst:         Number,
    totalAmount:  Number,
    createdBy:    { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
)

billSchema.index({ orderId: 1 })
billSchema.index({ type: 1 })
billSchema.index({ seriesNumber: 1 }, { unique: true })

export const Bill = mongoose.model<IBill>('Bill', billSchema)
