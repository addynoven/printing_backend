import { vi, describe, it, expect, beforeEach } from 'vitest'
import { Types } from 'mongoose'

vi.mock('../tasks/task.model', () => ({
  Task: { create: vi.fn() },
}))
vi.mock('../inventory/material.model', () => ({
  Material:    { findById: vi.fn() },
  StockLedger: { find: vi.fn(), create: vi.fn() },
}))
vi.mock('../barcode/barcode.model', () => ({
  Barcode: { create: vi.fn() },
}))
vi.mock('../notifications/notification.model', () => ({
  Notification: { create: vi.fn() },
}))
vi.mock('../auth/auth.model', () => ({
  User: { findByIdAndUpdate: vi.fn() },
}))
vi.mock('qrcode', () => ({
  toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,fake'),
}))

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

import {
  autoAssignTask,
  deductInventory,
  generateFinalBarcode,
  reverseInventoryIfDeducted,
} from './order.hooks'
import { Task } from '../tasks/task.model'
import { Material, StockLedger } from '../inventory/material.model'
import { Barcode } from '../barcode/barcode.model'
import { Notification } from '../notifications/notification.model'
import { User } from '../auth/auth.model'
import { IOrder } from './order.model'

const MockTask = vi.mocked(Task as unknown as { create: ReturnType<typeof vi.fn> })
const MockMaterial = vi.mocked(Material as unknown as {
  findById: ReturnType<typeof vi.fn>
})
const MockStockLedger = vi.mocked(StockLedger as unknown as {
  find:   ReturnType<typeof vi.fn>
  create: ReturnType<typeof vi.fn>
})
const MockBarcode = vi.mocked(Barcode as unknown as { create: ReturnType<typeof vi.fn> })
const MockNotification = vi.mocked(Notification as unknown as { create: ReturnType<typeof vi.fn> })
const MockUser = vi.mocked(User as unknown as { findByIdAndUpdate: ReturnType<typeof vi.fn> })

function makeOrderDoc(overrides: Partial<IOrder> = {}): IOrder {
  return {
    _id:          new Types.ObjectId(),
    orderNumber:  'ORD-2026-0001',
    jobType:      'flex_printing',
    priority:     'normal',
    bom:          [],
    createdBy:    new Types.ObjectId(),
    ...overrides,
  } as unknown as IOrder
}

describe('Order Hooks — Unit Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ── autoAssignTask ─────────────────────────────────────────────────────────
  describe('autoAssignTask', () => {
    it('creates an unassigned task when order has no assignedTo', async () => {
      MockTask.create.mockResolvedValue({ _id: new Types.ObjectId() })

      await autoAssignTask(makeOrderDoc())

      expect(MockTask.create).toHaveBeenCalledWith(
        expect.objectContaining({
          type:     'flex_printing',
          priority: 'normal',
          status:   'unassigned',
        })
      )
      expect(MockUser.findByIdAndUpdate).not.toHaveBeenCalled()
      expect(MockNotification.create).not.toHaveBeenCalled()
    })

    it('assigns task and bumps user count + notification when assignedTo set', async () => {
      const assignee = new Types.ObjectId()
      MockTask.create.mockResolvedValue({ _id: new Types.ObjectId() })

      await autoAssignTask(makeOrderDoc({ assignedTo: assignee } as Partial<IOrder>))

      expect(MockTask.create).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'assigned', assignedTo: assignee })
      )
      expect(MockUser.findByIdAndUpdate).toHaveBeenCalledWith(
        assignee,
        expect.objectContaining({ $inc: { activeTaskCount: 1 } })
      )
      expect(MockNotification.create).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'task_assigned', userId: assignee })
      )
    })
  })

  // ── deductInventory ────────────────────────────────────────────────────────
  describe('deductInventory', () => {
    it('returns early when bom is empty', async () => {
      await deductInventory(makeOrderDoc({ bom: [] }))
      expect(MockMaterial.findById).not.toHaveBeenCalled()
    })

    it('deducts stock and writes DEDUCT ledger entries', async () => {
      const matId = new Types.ObjectId()
      const matDoc = {
        _id:        matId,
        name:       'Flex',
        stock:      100,
        threshold:  20,
        save:       vi.fn().mockResolvedValue(undefined),
      }
      MockMaterial.findById.mockReturnValue({
        session: vi.fn().mockResolvedValue(matDoc),
      })
      MockStockLedger.create.mockResolvedValue([{}])

      await deductInventory(makeOrderDoc({
        bom: [{ materialId: matId, name: 'Flex', unit: 'sqft', qty: 30 }],
      } as Partial<IOrder>))

      expect(matDoc.stock).toBe(70)
      expect(MockStockLedger.create).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ type: 'DEDUCT', qty: -30, balanceAfter: 70 }),
        ]),
        expect.anything()
      )
    })

    it('emits a low_stock notification when balance falls to threshold', async () => {
      const matId = new Types.ObjectId()
      const matDoc = {
        _id:        matId,
        name:       'Ink',
        stock:      25,
        threshold:  20,
        save:       vi.fn().mockResolvedValue(undefined),
      }
      MockMaterial.findById.mockReturnValue({
        session: vi.fn().mockResolvedValue(matDoc),
      })
      MockStockLedger.create.mockResolvedValue([{}])
      MockNotification.create.mockResolvedValue([{}])

      await deductInventory(makeOrderDoc({
        bom: [{ materialId: matId, name: 'Ink', unit: 'ml', qty: 10 }],
      } as Partial<IOrder>))

      expect(matDoc.stock).toBe(15)
      expect(MockNotification.create).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ type: 'low_stock' }),
        ]),
        expect.anything()
      )
    })

    it('skips entries whose material is missing', async () => {
      MockMaterial.findById.mockReturnValue({
        session: vi.fn().mockResolvedValue(null),
      })

      await deductInventory(makeOrderDoc({
        bom: [{ materialId: new Types.ObjectId(), name: 'Gone', unit: 'kg', qty: 5 }],
      } as Partial<IOrder>))

      expect(MockStockLedger.create).not.toHaveBeenCalled()
    })
  })

  // ── generateFinalBarcode ───────────────────────────────────────────────────
  describe('generateFinalBarcode', () => {
    it('creates a final barcode and an order_completed notification', async () => {
      MockBarcode.create.mockResolvedValue({})
      MockNotification.create.mockResolvedValue({})

      await generateFinalBarcode(makeOrderDoc())

      expect(MockBarcode.create).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'final', qrDataUrl: 'data:image/png;base64,fake' })
      )
      expect(MockNotification.create).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'order_completed' })
      )
    })
  })

  // ── reverseInventoryIfDeducted ─────────────────────────────────────────────
  describe('reverseInventoryIfDeducted', () => {
    it('does nothing when no deductions exist', async () => {
      MockStockLedger.find.mockResolvedValue([])

      await reverseInventoryIfDeducted(makeOrderDoc())

      expect(MockMaterial.findById).not.toHaveBeenCalled()
      expect(MockStockLedger.create).not.toHaveBeenCalled()
    })

    it('writes a REVERSAL entry per prior DEDUCT and restores stock', async () => {
      const matId = new Types.ObjectId()
      MockStockLedger.find.mockResolvedValue([
        { materialId: matId, qty: -30 },
      ])
      const matDoc = {
        _id:   matId,
        stock: 70,
        save:  vi.fn().mockResolvedValue(undefined),
      }
      MockMaterial.findById.mockReturnValue({
        session: vi.fn().mockResolvedValue(matDoc),
      })
      MockStockLedger.create.mockResolvedValue([{}])

      await reverseInventoryIfDeducted(makeOrderDoc())

      expect(matDoc.stock).toBe(100)
      expect(MockStockLedger.create).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ type: 'REVERSAL', qty: 30, balanceAfter: 100 }),
        ]),
        expect.anything()
      )
    })
  })
})
