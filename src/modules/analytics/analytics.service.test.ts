import { vi, describe, it, expect, beforeEach } from 'vitest'

vi.mock('../orders/order.model', () => ({
  Order: { countDocuments: vi.fn(), aggregate: vi.fn() },
}))

vi.mock('../tasks/task.model', () => ({
  Task: { countDocuments: vi.fn(), aggregate: vi.fn() },
}))

vi.mock('../payments/payment.model', () => ({
  Payment: { aggregate: vi.fn() },
}))

vi.mock('../inventory/material.model', () => ({
  Material: { countDocuments: vi.fn() },
}))

import * as analyticsService from './analytics.service'
import { Order } from '../orders/order.model'
import { Task }  from '../tasks/task.model'
import { Payment } from '../payments/payment.model'
import { Material } from '../inventory/material.model'

const MockOrder   = vi.mocked(Order   as unknown as { countDocuments: ReturnType<typeof vi.fn>; aggregate: ReturnType<typeof vi.fn> })
const MockTask    = vi.mocked(Task    as unknown as { countDocuments: ReturnType<typeof vi.fn>; aggregate: ReturnType<typeof vi.fn> })
const MockPayment = vi.mocked(Payment as unknown as { aggregate: ReturnType<typeof vi.fn> })
const MockMat     = vi.mocked(Material as unknown as { countDocuments: ReturnType<typeof vi.fn> })

describe('Analytics Service — Unit Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ── getOverview ───────────────────────────────────────────────────────────
  describe('getOverview()', () => {
    it('returns orders, tasks, revenue, lowStock counts', async () => {
      MockOrder.countDocuments.mockResolvedValue(10)
      MockTask.countDocuments.mockResolvedValue(8)
      MockPayment.aggregate.mockResolvedValue([{ total: 5000 }])
      MockMat.countDocuments.mockResolvedValue(2)

      const result = await analyticsService.getOverview()

      expect(result).toMatchObject({ orders: 10, tasks: 8, revenue: 5000, lowStock: 2 })
    })

    it('returns revenue=0 when no completed payments exist', async () => {
      MockOrder.countDocuments.mockResolvedValue(0)
      MockTask.countDocuments.mockResolvedValue(0)
      MockPayment.aggregate.mockResolvedValue([])     // empty = no payments
      MockMat.countDocuments.mockResolvedValue(0)

      const result = await analyticsService.getOverview()

      expect(result.revenue).toBe(0)
    })
  })

  // ── getOrderStats ────────────────────────────────────────────────────────
  describe('getOrderStats()', () => {
    it('returns orders grouped by status', async () => {
      const agg = [{ _id: 'draft', count: 3 }, { _id: 'confirmed', count: 2 }]
      MockOrder.aggregate.mockResolvedValue(agg)

      const result = await analyticsService.getOrderStats()

      expect(result.byStatus).toEqual(agg)
      expect(MockOrder.aggregate).toHaveBeenCalled()
    })
  })

  // ── getRevenueStats ──────────────────────────────────────────────────────
  describe('getRevenueStats()', () => {
    it('returns payments grouped by method with a total', async () => {
      const agg = [
        { _id: 'cash',  total: 3000, count: 6 },
        { _id: 'upi',   total: 2000, count: 4 },
      ]
      MockPayment.aggregate.mockResolvedValue(agg)

      const result = await analyticsService.getRevenueStats()

      expect(result.byMethod).toEqual(agg)
      expect(result.total).toBe(5000)
    })

    it('returns total=0 when aggregate is empty', async () => {
      MockPayment.aggregate.mockResolvedValue([])

      const result = await analyticsService.getRevenueStats()

      expect(result.total).toBe(0)
    })
  })

  // ── getTaskStats ─────────────────────────────────────────────────────────
  describe('getTaskStats()', () => {
    it('returns tasks grouped by status with avgMinutes', async () => {
      const agg = [
        { _id: 'done',        count: 5, avgMinutes: 42 },
        { _id: 'in_progress', count: 2, avgMinutes: 0  },
      ]
      MockTask.aggregate.mockResolvedValue(agg)

      const result = await analyticsService.getTaskStats()

      expect(result.byStatus).toEqual(agg)
      expect(MockTask.aggregate).toHaveBeenCalled()
    })
  })
})
