import mongoose, { Schema, Document, Types } from 'mongoose'

export const MATERIAL_CATEGORIES = ['flex', 'paper', 'ink', 'acrylic', 'glass', 'other'] as const
export const MATERIAL_UNITS       = ['sqft', 'ml', 'sheets', 'kg', 'pcs'] as const
export const LEDGER_TYPES         = ['DEDUCT', 'RESTOCK', 'REVERSAL', 'ADJUSTMENT'] as const

export type MaterialCategory = typeof MATERIAL_CATEGORIES[number]
export type MaterialUnit     = typeof MATERIAL_UNITS[number]
export type LedgerType       = typeof LEDGER_TYPES[number]

export interface IMaterial extends Document {
  name:         string
  category:     MaterialCategory
  unit:         MaterialUnit
  stock:        number
  threshold:    number
  costPerUnit:  number
  supplier: {
    name?:  string
    phone?: string
    email?: string
  }
  isActive:  boolean
  createdAt: Date
  updatedAt: Date
}

export interface IStockLedger extends Document {
  materialId:   Types.ObjectId
  orderId?:     Types.ObjectId
  type:         LedgerType
  qty:          number
  balanceAfter: number
  note?:        string
  performedBy:  Types.ObjectId
  createdAt:    Date
}

const materialSchema = new Schema<IMaterial>(
  {
    name:        { type: String, required: true, unique: true, trim: true },
    category:    { type: String, enum: MATERIAL_CATEGORIES, required: true },
    unit:        { type: String, enum: MATERIAL_UNITS, required: true },
    stock:       { type: Number, required: true, min: 0, default: 0 },
    threshold:   { type: Number, required: true, min: 0, default: 0 },
    costPerUnit: { type: Number, required: true, min: 0 },
    supplier: {
      name:  String,
      phone: String,
      email: String,
    },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
)

materialSchema.index({ category: 1 })
materialSchema.index({ stock: 1 })

const stockLedgerSchema = new Schema<IStockLedger>(
  {
    materialId:   { type: Schema.Types.ObjectId, ref: 'Material', required: true },
    orderId:      { type: Schema.Types.ObjectId, ref: 'Order' },
    type:         { type: String, enum: LEDGER_TYPES, required: true },
    qty:          { type: Number, required: true },
    balanceAfter: { type: Number, required: true },
    note:         { type: String },
    performedBy:  { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
)

stockLedgerSchema.index({ materialId: 1, createdAt: -1 })
stockLedgerSchema.index({ orderId: 1 })

export const Material    = mongoose.model<IMaterial>('Material', materialSchema)
export const StockLedger = mongoose.model<IStockLedger>('StockLedger', stockLedgerSchema)
