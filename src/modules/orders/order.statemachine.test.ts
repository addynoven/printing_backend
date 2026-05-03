import { vi, describe, it, expect, beforeEach } from 'vitest'

vi.mock('./order.model', () => ({
  Order: { findById: vi.fn() },
}))

vi.mock('../tasks/task.assigner', () => ({
  autoAssignTask: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../inventory/inventory.service', () => ({
  deductForOrder:          vi.fn().mockResolvedValue(undefined),
  reverseOrderDeductions:  vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../barcode/barcode.service', () => ({
  generateBarcode: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../audit/activity-log.service', () => ({
  logActivity: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../customers/customer.service', () => ({
  updateCustomerStats: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../notifications/notification.model', () => ({
  Notification: { create: vi.fn().mockResolvedValue({}) },
}))

import { canTransition, transitionOrder } from './order.statemachine'
import { Order } from './order.model'
import { NotFoundError, ValidationError } from '../../utils/AppError'
import { Types } from 'mongoose'

const MockOrder = vi.mocked(Order as unknown as {
  findById: ReturnType<typeof vi.fn>
})

describe('Order State Machine', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ── canTransition (pure function — no mocks needed) ───────────────────────
  describe('canTransition', () => {
    it('draft → confirmed is valid', () => {
      expect(canTransition('draft', 'confirmed')).toBe(true)
    })

    it('draft → cancelled is valid', () => {
      expect(canTransition('draft', 'cancelled')).toBe(true)
    })

    it('confirmed → designing is valid', () => {
      expect(canTransition('confirmed', 'designing')).toBe(true)
    })

    it('confirmed → cancelled is valid', () => {
      expect(canTransition('confirmed', 'cancelled')).toBe(true)
    })

    it('designing → in_production is valid', () => {
      expect(canTransition('designing', 'in_production')).toBe(true)
    })

    it('designing → cancelled is valid', () => {
      expect(canTransition('designing', 'cancelled')).toBe(true)
    })

    it('in_production → finishing is valid', () => {
      expect(canTransition('in_production', 'finishing')).toBe(true)
    })

    it('finishing → completed is valid', () => {
      expect(canTransition('finishing', 'completed')).toBe(true)
    })

    it('completed → invoiced is valid', () => {
      expect(canTransition('completed', 'invoiced')).toBe(true)
    })

    it('draft → invoiced is invalid', () => {
      expect(canTransition('draft', 'invoiced')).toBe(false)
    })

    it('invoiced → cancelled is invalid (terminal state)', () => {
      expect(canTransition('invoiced', 'cancelled')).toBe(false)
    })

    it('cancelled → draft is invalid (terminal state)', () => {
      expect(canTransition('cancelled', 'draft')).toBe(false)
    })

    it('draft → completed is invalid (skips states)', () => {
      expect(canTransition('draft', 'completed')).toBe(false)
    })

    it('invoiced → any further state is invalid', () => {
      expect(canTransition('invoiced', 'completed')).toBe(false)
      expect(canTransition('invoiced', 'designing')).toBe(false)
    })

    it('in_production cannot be cancelled', () => {
      expect(canTransition('in_production', 'cancelled')).toBe(false)
    })
  })

  // ── transitionOrder ───────────────────────────────────────────────────────
  describe('transitionOrder', () => {
    it('updates status and pushes to statusHistory, then calls save', async () => {
      const saveMock = vi.fn().mockResolvedValue(undefined)
      const orderDoc = {
        _id:           new Types.ObjectId(),
        status:        'draft',
        statusHistory: [] as Array<Record<string, unknown>>,
        save:          saveMock,
      }
      MockOrder.findById.mockResolvedValue(orderDoc)

      const actorId = new Types.ObjectId().toString()
      await transitionOrder('order_id', 'confirmed', actorId, 'Confirmed by admin')

      expect(orderDoc.status).toBe('confirmed')
      expect(orderDoc.statusHistory).toHaveLength(1)
      expect(orderDoc.statusHistory[0].status).toBe('confirmed')
      expect(saveMock).toHaveBeenCalledTimes(1)
    })

    it('statusHistory entry has actorId as changedBy', async () => {
      const saveMock = vi.fn().mockResolvedValue(undefined)
      const orderDoc = {
        _id:           new Types.ObjectId(),
        status:        'draft',
        statusHistory: [] as Array<Record<string, unknown>>,
        save:          saveMock,
      }
      MockOrder.findById.mockResolvedValue(orderDoc)

      const actorId = new Types.ObjectId().toString()
      await transitionOrder('order_id', 'confirmed', actorId)

      const entry = orderDoc.statusHistory[0]
      expect(entry.changedBy.toString()).toBe(actorId)
      expect(entry.at).toBeInstanceOf(Date)
    })

    it('throws ValidationError for invalid transition (draft → invoiced)', async () => {
      const orderDoc = {
        _id:           new Types.ObjectId(),
        status:        'draft',
        statusHistory: [],
        save:          vi.fn(),
      }
      MockOrder.findById.mockResolvedValue(orderDoc)

      await expect(
        transitionOrder('order_id', 'invoiced', new Types.ObjectId().toString())
      ).rejects.toBeInstanceOf(ValidationError)
    })

    it('throws NotFoundError when order not found', async () => {
      MockOrder.findById.mockResolvedValue(null)

      await expect(
        transitionOrder('bad_id', 'confirmed', new Types.ObjectId().toString())
      ).rejects.toBeInstanceOf(NotFoundError)
    })
  })
})
