import { vi, describe, it, expect, beforeEach } from 'vitest'

vi.mock('./material.model', () => {
  const mockMaterial = {
    find:              vi.fn(),
    findOne:           vi.fn(),
    findById:          vi.fn(),
    create:            vi.fn(),
    findByIdAndUpdate: vi.fn(),
  }
  const mockStockLedger = {
    find:   vi.fn(),
    create: vi.fn(),
  }
  return { Material: mockMaterial, StockLedger: mockStockLedger }
})

vi.mock('mongoose', async (importActual) => {
  const actual = await importActual<typeof import('mongoose')>()
  return {
    ...actual,
    default: {
      ...actual.default,
      startSession: vi.fn().mockResolvedValue({
        startTransaction:  vi.fn(),
        commitTransaction: vi.fn(),
        abortTransaction:  vi.fn(),
        endSession:        vi.fn(),
      }),
    },
  }
})

import * as inventoryService from './inventory.service'
import { Material, StockLedger } from './material.model'
import mongoose from 'mongoose'
import { makeMaterial } from '../../../tests/helpers/mock-factory'
import { NotFoundError, ConflictError } from '../../utils/AppError'

const MockMaterial = vi.mocked(Material as unknown as {
  find:              ReturnType<typeof vi.fn>
  findOne:           ReturnType<typeof vi.fn>
  findById:          ReturnType<typeof vi.fn>
  create:            ReturnType<typeof vi.fn>
  findByIdAndUpdate: ReturnType<typeof vi.fn>
})

const MockStockLedger = vi.mocked(StockLedger as unknown as {
  find:   ReturnType<typeof vi.fn>
  create: ReturnType<typeof vi.fn>
})

function chain(value: unknown) {
  return { lean: vi.fn().mockResolvedValue(value) }
}

describe('Inventory Service — Unit Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ──────────────────────────────────────────────
  // listMaterials
  // ──────────────────────────────────────────────
  describe('listMaterials', () => {
    it('returns all active materials when no filter applied', async () => {
      const materials = [makeMaterial(), makeMaterial({ name: 'Ink A', category: 'ink', unit: 'ml' })]
      MockMaterial.find.mockReturnValue(chain(materials))

      const result = await inventoryService.listMaterials({})

      expect(MockMaterial.find).toHaveBeenCalledWith(expect.objectContaining({ isActive: true }))
      expect(result.total).toBe(2)
      expect(result.materials).toHaveLength(2)
    })

    it('filters by category', async () => {
      MockMaterial.find.mockReturnValue(chain([makeMaterial({ category: 'ink', unit: 'ml', name: 'Ink B' })]))

      const result = await inventoryService.listMaterials({ category: 'ink' })

      expect(MockMaterial.find).toHaveBeenCalledWith(expect.objectContaining({ category: 'ink' }))
      expect(result.total).toBe(1)
    })

    it('can query isActive=false', async () => {
      MockMaterial.find.mockReturnValue(chain([makeMaterial({ isActive: false })]))

      await inventoryService.listMaterials({ isActive: false })

      expect(MockMaterial.find).toHaveBeenCalledWith(expect.objectContaining({ isActive: false }))
    })
  })

  // ──────────────────────────────────────────────
  // createMaterial
  // ──────────────────────────────────────────────
  describe('createMaterial', () => {
    it('creates and returns plain object', async () => {
      const data = makeMaterial({ name: 'New Flex' })
      const created = { ...data, _id: 'mat_1', toObject: () => ({ ...data, _id: 'mat_1' }) }

      MockMaterial.findOne.mockResolvedValue(null)
      MockMaterial.create.mockResolvedValue(created)

      const result = await inventoryService.createMaterial({
        name:        data.name,
        category:    'flex',
        unit:        'sqft',
        threshold:   data.threshold,
        costPerUnit: data.costPerUnit,
      })

      expect(result).toMatchObject({ name: 'New Flex' })
      expect(MockMaterial.create).toHaveBeenCalledTimes(1)
    })

    it('throws ConflictError when name already exists', async () => {
      MockMaterial.findOne.mockResolvedValue(makeMaterial({ name: 'Duplicate' }))

      await expect(
        inventoryService.createMaterial({
          name:        'Duplicate',
          category:    'flex',
          unit:        'sqft',
          threshold:   5,
          costPerUnit: 3,
        })
      ).rejects.toBeInstanceOf(ConflictError)

      expect(MockMaterial.create).not.toHaveBeenCalled()
    })
  })

  // ──────────────────────────────────────────────
  // getMaterialById
  // ──────────────────────────────────────────────
  describe('getMaterialById', () => {
    it('returns material when found', async () => {
      MockMaterial.findById.mockReturnValue(chain(makeMaterial({ name: 'Found Mat' })))

      const result = await inventoryService.getMaterialById('mat_001')

      expect(result).toMatchObject({ name: 'Found Mat' })
    })

    it('throws NotFoundError when null', async () => {
      MockMaterial.findById.mockReturnValue(chain(null))

      await expect(inventoryService.getMaterialById('mat_bad')).rejects.toBeInstanceOf(NotFoundError)
    })
  })

  // ──────────────────────────────────────────────
  // updateMaterial
  // ──────────────────────────────────────────────
  describe('updateMaterial', () => {
    it('updates fields and returns updated material', async () => {
      const updated = makeMaterial({ threshold: 20, costPerUnit: 8 })
      MockMaterial.findByIdAndUpdate.mockReturnValue(chain(updated))

      const result = await inventoryService.updateMaterial('mat_001', { threshold: 20, costPerUnit: 8 })

      expect(MockMaterial.findByIdAndUpdate).toHaveBeenCalledWith(
        'mat_001',
        expect.objectContaining({ threshold: 20, costPerUnit: 8 }),
        expect.objectContaining({ new: true, runValidators: true })
      )
      expect(result).toMatchObject({ threshold: 20, costPerUnit: 8 })
    })

    it('throws NotFoundError when null', async () => {
      MockMaterial.findByIdAndUpdate.mockReturnValue(chain(null))

      await expect(inventoryService.updateMaterial('bad_id', { threshold: 5 })).rejects.toBeInstanceOf(NotFoundError)
    })
  })

  // ──────────────────────────────────────────────
  // restock
  // ──────────────────────────────────────────────
  describe('restock', () => {
    it('increments stock, creates RESTOCK ledger entry, returns { material, transaction }', async () => {
      const matData = makeMaterial({ stock: 50 })
      const mockDoc = {
        ...matData,
        stock: 50,
        save: vi.fn().mockResolvedValue(undefined),
        toObject: vi.fn().mockReturnValue({ ...matData, stock: 60 }),
      }

      const ledgerData = {
        materialId:   'mat_001',
        type:         'RESTOCK',
        qty:          10,
        balanceAfter: 60,
        performedBy:  'usr_001',
      }
      const mockLedgerDoc = { toObject: vi.fn().mockReturnValue(ledgerData) }

      // findById returns a session-chainable mock
      MockMaterial.findById.mockReturnValue({ session: vi.fn().mockResolvedValue(mockDoc) })
      MockStockLedger.create.mockResolvedValue([mockLedgerDoc])

      const result = await inventoryService.restock('mat_001', 10, 'usr_001', 'top-up')

      expect(mockDoc.stock).toBe(60)
      expect(MockStockLedger.create).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ type: 'RESTOCK', qty: 10 }),
        ]),
        expect.anything()
      )
      expect(result).toHaveProperty('material')
      expect(result).toHaveProperty('transaction')
    })

    it('throws NotFoundError when material not found', async () => {
      MockMaterial.findById.mockReturnValue({ session: vi.fn().mockResolvedValue(null) })

      await expect(inventoryService.restock('bad_id', 5, 'usr_001')).rejects.toBeInstanceOf(NotFoundError)
    })
  })

  // ──────────────────────────────────────────────
  // getLedger
  // ──────────────────────────────────────────────
  describe('getLedger', () => {
    it('throws NotFoundError when material not found', async () => {
      MockMaterial.findById.mockReturnValue(chain(null))

      await expect(inventoryService.getLedger('bad_id')).rejects.toBeInstanceOf(NotFoundError)
    })

    it('returns { entries, total } when material exists', async () => {
      MockMaterial.findById.mockReturnValue(chain(makeMaterial()))
      const entries = [
        { type: 'RESTOCK', qty: 10, balanceAfter: 110 },
        { type: 'DEDUCT',  qty: 5,  balanceAfter: 105 },
      ]
      MockStockLedger.find.mockReturnValue({
        sort: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(entries) }),
      })

      const result = await inventoryService.getLedger('mat_001')

      expect(result.entries).toHaveLength(2)
      expect(result.total).toBe(2)
    })
  })

  // ──────────────────────────────────────────────
  // getLowStockAlerts
  // ──────────────────────────────────────────────
  describe('getLowStockAlerts', () => {
    it('returns materials where stock <= threshold', async () => {
      const lowStock = [makeMaterial({ stock: 5, threshold: 10 })]
      MockMaterial.find.mockReturnValue(chain(lowStock))

      const result = await inventoryService.getLowStockAlerts()

      expect(MockMaterial.find).toHaveBeenCalledWith(
        expect.objectContaining({
          isActive: true,
          $expr:    expect.any(Object),
        })
      )
      expect(result.materials).toHaveLength(1)
      expect(result.total).toBe(1)
    })
  })
})
