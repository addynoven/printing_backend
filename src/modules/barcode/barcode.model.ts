import mongoose, { Schema, Document, Types } from 'mongoose'

export const BARCODE_TYPES = ['initial', 'final'] as const
export type BarcodeType = typeof BARCODE_TYPES[number]

export interface IBarcode extends Document {
  orderId:   Types.ObjectId
  type:      BarcodeType
  code:      string
  qrDataUrl: string
  createdAt: Date
}

export interface IScanEvent extends Document {
  orderId:   Types.ObjectId
  scannedBy: Types.ObjectId
  action:    string
  notes?:    string
  ip?:       string
  timestamp: Date
}

const barcodeSchema = new Schema<IBarcode>(
  {
    orderId:   { type: Schema.Types.ObjectId, ref: 'Order', required: true },
    type:      { type: String, enum: BARCODE_TYPES, required: true },
    code:      { type: String, required: true },
    qrDataUrl: { type: String, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
)

barcodeSchema.index({ orderId: 1 })

const scanEventSchema = new Schema<IScanEvent>({
  orderId:   { type: Schema.Types.ObjectId, ref: 'Order', required: true },
  scannedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  action:    { type: String, required: true },
  notes:     String,
  ip:        String,
  timestamp: { type: Date, default: Date.now },
})

scanEventSchema.index({ orderId: 1 })
scanEventSchema.index({ scannedBy: 1 })

export const Barcode   = mongoose.model<IBarcode>('Barcode', barcodeSchema)
export const ScanEvent = mongoose.model<IScanEvent>('ScanEvent', scanEventSchema)
