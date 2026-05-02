import mongoose, { Types } from 'mongoose'
import { Material, StockLedger, MaterialCategory } from './material.model'
import { IOrder } from '../orders/order.model'
import { NotFoundError, ConflictError } from '../../utils/AppError'

export interface ListMaterialsQuery {
  category?: MaterialCategory
  isActive?: boolean
}

export interface CreateMaterialInput {
  name:        string
  category:    MaterialCategory
  unit:        string
  stock?:      number
  threshold:   number
  costPerUnit: number
  supplier?: {
    name?:  string
    phone?: string
    email?: string
  }
}

export interface UpdateMaterialInput {
  name?:        string
  category?:    MaterialCategory
  threshold?:   number
  costPerUnit?: number
  supplier?: {
    name?:  string
    phone?: string
    email?: string
  }
}

export async function listMaterials(query: ListMaterialsQuery) {
  const filter: Record<string, unknown> = {
    isActive: query.isActive !== undefined ? query.isActive : true,
  }
  if (query.category) filter.category = query.category

  const materials = await Material.find(filter).lean()
  return { materials, total: materials.length }
}

export async function createMaterial(data: CreateMaterialInput) {
  const exists = await Material.findOne({ name: data.name })
  if (exists) throw new ConflictError('Material with that name already exists')

  const material = await Material.create(data)
  return material.toObject()
}

export async function getMaterialById(id: string) {
  const material = await Material.findById(id).lean()
  if (!material) throw new NotFoundError('Material not found')
  return material
}

export async function updateMaterial(id: string, data: UpdateMaterialInput) {
  const material = await Material.findByIdAndUpdate(id, data, { new: true, runValidators: true }).lean()
  if (!material) throw new NotFoundError('Material not found')
  return material
}

export async function restock(
  materialId: string,
  qty: number,
  performedBy: string,
  note?: string,
  orderId?: string
) {
  const session = await mongoose.startSession()
  session.startTransaction()

  try {
    const material = await Material.findById(materialId).session(session)
    if (!material) throw new NotFoundError('Material not found')

    material.stock += qty
    await material.save({ session })

    const ledgerEntry = await StockLedger.create([{
      materialId,
      orderId:      orderId ?? null,
      type:         qty > 0 ? 'RESTOCK' : 'DEDUCT',
      qty,
      balanceAfter: material.stock,
      note,
      performedBy,
    }], { session })

    await session.commitTransaction()
    return { material: material.toObject(), transaction: ledgerEntry[0].toObject() }
  } catch (err) {
    await session.abortTransaction()
    throw err
  } finally {
    session.endSession()
  }
}

export async function getLedger(materialId: string) {
  const material = await Material.findById(materialId).lean()
  if (!material) throw new NotFoundError('Material not found')

  const entries = await StockLedger.find({ materialId }).sort({ createdAt: -1 }).lean()
  return { entries, total: entries.length }
}

export async function getLowStockAlerts() {
  const materials = await Material.find({
    isActive: true,
    $expr: { $lte: ['$stock', '$threshold'] },
  }).lean()
  return { materials, total: materials.length }
}

export async function deductForOrder(order: IOrder, performedBy: string | Types.ObjectId) {
  if (!order.bom || order.bom.length === 0) return

  const session = await mongoose.startSession()
  session.startTransaction()

  try {
    for (const entry of order.bom) {
      const material = await Material.findById(entry.materialId).session(session)
      if (!material) throw new NotFoundError(`Material ${entry.materialId} not found`)

      material.stock -= entry.qty
      await material.save({ session })

      await StockLedger.create([{
        materialId:   entry.materialId,
        orderId:      order._id,
        type:         'DEDUCT',
        qty:          -entry.qty,
        balanceAfter: material.stock,
        note:         `Order ${order.orderNumber} completed`,
        performedBy,
      }], { session })
    }

    await session.commitTransaction()
  } catch (err) {
    await session.abortTransaction()
    throw err
  } finally {
    session.endSession()
  }
}

export async function reverseOrderDeductions(order: IOrder, performedBy: string | Types.ObjectId) {
  const deductions = await StockLedger.find({
    orderId: order._id,
    type:    'DEDUCT',
  }).lean()

  if (deductions.length === 0) return

  const session = await mongoose.startSession()
  session.startTransaction()

  try {
    for (const deduction of deductions) {
      const material = await Material.findById(deduction.materialId).session(session)
      if (!material) continue

      const reverseQty = Math.abs(deduction.qty)
      material.stock += reverseQty
      await material.save({ session })

      await StockLedger.create([{
        materialId:   deduction.materialId,
        orderId:      order._id,
        type:         'REVERSAL',
        qty:          reverseQty,
        balanceAfter: material.stock,
        note:         `Reversal for cancelled order ${order.orderNumber}`,
        performedBy,
      }], { session })
    }

    await session.commitTransaction()
  } catch (err) {
    await session.abortTransaction()
    throw err
  } finally {
    session.endSession()
  }
}
