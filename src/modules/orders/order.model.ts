import mongoose, { Schema, Document, Types } from 'mongoose'

export const JOB_TYPES = [
  'flex_printing', 'screen_printing', 'design',
  'laser_cut', 'offset', 'acrylic', 'glass', 'binding',
] as const

export const ORDER_STATUSES = [
  'draft', 'confirmed', 'designing', 'in_production',
  'finishing', 'completed', 'invoiced', 'cancelled',
] as const

export const PRIORITIES = ['normal', 'urgent'] as const

export type JobType      = typeof JOB_TYPES[number]
export type OrderStatus  = typeof ORDER_STATUSES[number]
export type Priority     = typeof PRIORITIES[number]

export interface IOrderItem {
  description: string
  quantity:    number
  unit:        string
  unitPrice:   number
}

export interface IBomEntry {
  materialId: Types.ObjectId
  name:       string
  unit:       string
  qty:        number
}

export interface IStatusHistory {
  status:    string
  changedBy: Types.ObjectId
  note?:     string
  at:        Date
}

export interface IOrder extends Document {
  orderNumber:   string
  customerId?:   Types.ObjectId
  customer: {
    name:  string
    phone: string
    email: string
  }
  jobType:       JobType
  items:         IOrderItem[]
  bom:           IBomEntry[]
  rawCost:       number
  taxableValue:  number
  billSplitPct:  number
  hsnCode?:      string
  status:        OrderStatus
  statusHistory: IStatusHistory[]
  priority:      Priority
  deadline?:     Date
  assignedTo?:   Types.ObjectId
  advancePaid:   number
  discountAmount: number
  appliedDiscountId?: Types.ObjectId
  appliedCouponCode?: string
  notes?:        string
  createdBy:     Types.ObjectId
  createdAt:     Date
  updatedAt:     Date
}

const orderSchema = new Schema<IOrder>(
  {
    orderNumber: { type: String, unique: true },
    customerId:   { type: Schema.Types.ObjectId, ref: 'Customer' },
    customer: {
      name:  { type: String, required: true },
      phone: { type: String, required: true },
      email: { type: String },
    },
    jobType:      { type: String, enum: JOB_TYPES, required: true },
    items: [{
      description: { type: String, required: true },
      quantity:    { type: Number, required: true },
      unit:        { type: String, required: true },
      unitPrice:   { type: Number, required: true },
    }],
    bom: [{
      materialId: { type: Schema.Types.ObjectId, ref: 'Material' },
      name:       String,
      unit:       String,
      qty:        Number,
    }],
    rawCost:      { type: Number, required: true },
    taxableValue: { type: Number, required: true },
    billSplitPct: { type: Number, required: true, min: 0, max: 100 },
    hsnCode:      { type: String },
    status:       { type: String, enum: ORDER_STATUSES, default: 'draft' },
    statusHistory: [{
      status:    { type: String, required: true },
      changedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
      note:      { type: String },
      at:        { type: Date, default: Date.now },
    }],
    priority:    { type: String, enum: PRIORITIES, default: 'normal' },
    deadline:    { type: Date },
    assignedTo:  { type: Schema.Types.ObjectId, ref: 'User' },
    advancePaid: { type: Number, default: 0 },
    discountAmount:    { type: Number, default: 0 },
    appliedDiscountId: { type: Schema.Types.ObjectId, ref: 'Discount' },
    appliedCouponCode: { type: String, uppercase: true, trim: true },
    notes:       { type: String },
    createdBy:   { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
)

orderSchema.index({ status: 1 })
orderSchema.index({ status: 1, priority: 1 })
orderSchema.index({ createdAt: -1 })
orderSchema.index({ 'customer.phone': 1 })
orderSchema.index({ assignedTo: 1, status: 1 })

orderSchema.pre('save', async function (next) {
  if (this.isNew && !this.orderNumber) {
    const count = await mongoose.model('Order').countDocuments()
    const year  = new Date().getFullYear()
    this.orderNumber = `ORD-${year}-${String(count + 1).padStart(4, '0')}`
  }
  next()
})

export const Order = mongoose.model<IOrder>('Order', orderSchema)
