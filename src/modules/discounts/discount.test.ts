import { vi, describe, it, expect, beforeEach } from 'vitest'

vi.mock('./discount.model', () => {
  const Discount = {
    find: vi.fn(),
    findById: vi.fn(),
    create: vi.fn(),
    findByIdAndUpdate: vi.fn(),
  }
  return { Discount, DISCOUNT_TYPES: ['percentage', 'fixed'], DISCOUNT_SCOPES: ['normal', 'loyal', 'all'] }
})

function chain(value: unknown) {
  return { sort: vi.fn().mockReturnThis(), lean: vi.fn().mockResolvedValue(value) }
}

vi.mock('./discount-log.model', () => ({
  DiscountLog: { create: vi.fn(), find: vi.fn() },
}))

import * as discountService from './discount.service'
import { Discount, DiscountType } from './discount.model'
import { DiscountLog } from './discount-log.model'
import { makeDiscount } from '../../../tests/helpers/mock-factory'
import { BadRequestError, NotFoundError } from '../../utils/AppError'

const MockDiscount = vi.mocked(Discount as unknown as {
  find: ReturnType<typeof vi.fn>
  findById: ReturnType<typeof vi.fn>
  create: ReturnType<typeof vi.fn>
  findByIdAndUpdate: ReturnType<typeof vi.fn>
})

const MockDiscountLog = vi.mocked(DiscountLog as unknown as {
  create: ReturnType<typeof vi.fn>
  find: ReturnType<typeof vi.fn>
})

describe('Discount Service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('listDiscounts', () => {
    it('returns active discounts', async () => {
      const discounts = [makeDiscount(), makeDiscount({ name: 'Winter Sale' })]
      MockDiscount.find.mockReturnValue(chain(discounts))

      const result = await discountService.listDiscounts()

      expect(result.total).toBe(2)
    })

    it('filters by scope', async () => {
      MockDiscount.find.mockReturnValue(chain([]))
      await discountService.listDiscounts('loyal')
    })
  })

  describe('createDiscount', () => {
    it('creates a percentage discount', async () => {
      const data = makeDiscount({ type: 'percentage', value: 15 })
      MockDiscount.create.mockResolvedValue(data)

      const result = await discountService.createDiscount({ ...data, createdBy: 'usr_1' })

      expect(MockDiscount.create).toHaveBeenCalledWith(expect.objectContaining({ name: 'Summer Sale' }))
      expect(result).toMatchObject({ type: 'percentage', value: 15 })
    })

    it('rejects percentage > 100', async () => {
      await expect(
        discountService.createDiscount({ ...makeDiscount({ type: 'percentage' as DiscountType, value: 101 }), createdBy: 'usr_1' })
      ).rejects.toBeInstanceOf(BadRequestError)
    })
  })

  describe('updateDiscount', () => {
    it('updates and returns discount', async () => {
      const updated = makeDiscount({ name: 'Updated' })
      MockDiscount.findByIdAndUpdate.mockReturnValue(chain(updated))

      const result = await discountService.updateDiscount('disc_1', { name: 'Updated' })

      expect(result.name).toBe('Updated')
    })

    it('throws NotFoundError when discount missing', async () => {
      MockDiscount.findByIdAndUpdate.mockReturnValue(chain(null))
      await expect(discountService.updateDiscount('missing', {})).rejects.toBeInstanceOf(NotFoundError)
    })
  })

  describe('deleteDiscount', () => {
    it('soft-deletes by setting isActive false', async () => {
      MockDiscount.findByIdAndUpdate.mockReturnValue(chain(makeDiscount({ isActive: false })))
      await discountService.deleteDiscount('disc_1')
      expect(MockDiscount.findByIdAndUpdate).toHaveBeenCalledWith('disc_1', { isActive: false }, { new: true })
    })
  })

  describe('calculateDiscountAmount', () => {
    it('percentage discount', () => {
      const amount = discountService.calculateDiscountAmount(1000, { type: 'percentage', value: 10 })
      expect(amount).toBe(100)
    })

    it('fixed discount', () => {
      const amount = discountService.calculateDiscountAmount(1000, { type: 'fixed', value: 50 })
      expect(amount).toBe(50)
    })

    it('respects maxDiscount cap', () => {
      const amount = discountService.calculateDiscountAmount(10000, { type: 'percentage', value: 20, maxDiscount: 1000 })
      expect(amount).toBe(1000)
    })

    it('respects minOrderValue threshold', () => {
      const amount = discountService.calculateDiscountAmount(500, { type: 'fixed', value: 50, minOrderValue: 1000 })
      expect(amount).toBe(0)
    })

    it('never exceeds subtotal', () => {
      const amount = discountService.calculateDiscountAmount(100, { type: 'fixed', value: 200 })
      expect(amount).toBe(100)
    })
  })

  describe('logDiscountApplication', () => {
    it('creates a log entry', async () => {
      MockDiscountLog.create.mockResolvedValue({ _id: 'log_1' })
      await discountService.logDiscountApplication({
        orderId: 'ord_1', discountId: 'disc_1', name: 'Sale', type: 'percentage', value: 10, amountSaved: 100, appliedBy: 'usr_1',
      })
      expect(MockDiscountLog.create).toHaveBeenCalledWith(expect.objectContaining({ amountSaved: 100 }))
    })
  })
})
