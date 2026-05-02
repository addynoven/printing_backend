import { vi, describe, it, expect, beforeEach } from 'vitest'

vi.mock('./coupon.model', () => ({
  Coupon: {
    findOne: vi.fn(),
    find: vi.fn(),
    create: vi.fn(),
    countDocuments: vi.fn(),
  },
  COUPON_STATUSES: ['active', 'used', 'expired'],
}))

vi.mock('./loyalty-tier.model', () => ({
  LoyaltyTierConfig: {
    findOne: vi.fn(),
    find: vi.fn(),
    findOneAndUpdate: vi.fn(),
  },
}))

vi.mock('../customers/customer.model', () => ({
  Customer: {
    findById: vi.fn(),
    findOne: vi.fn(),
  },
  LOYALTY_TIERS: ['bronze', 'silver', 'gold', 'platinum'],
}))

function chain(value: unknown) {
  return { sort: vi.fn().mockReturnThis(), lean: vi.fn().mockResolvedValue(value) }
}

import * as loyaltyService from './loyalty.service'
import { Coupon } from './coupon.model'
import { LoyaltyTierConfig } from './loyalty-tier.model'
import { Customer } from '../customers/customer.model'
import { makeCoupon } from '../../../tests/helpers/mock-factory'
import { NotFoundError, BadRequestError } from '../../utils/AppError'

const MockCoupon = vi.mocked(Coupon as unknown as {
  findOne: ReturnType<typeof vi.fn>
  find: ReturnType<typeof vi.fn>
  create: ReturnType<typeof vi.fn>
  countDocuments: ReturnType<typeof vi.fn>
})

const MockTierConfig = vi.mocked(LoyaltyTierConfig as unknown as {
  findOne: ReturnType<typeof vi.fn>
  find: ReturnType<typeof vi.fn>
  findOneAndUpdate: ReturnType<typeof vi.fn>
})

const MockCustomer = vi.mocked(Customer as unknown as {
  findById: ReturnType<typeof vi.fn>
  findOne: ReturnType<typeof vi.fn>
})

describe('Loyalty Service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('upsertTierConfig', () => {
    it('creates or updates tier config', async () => {
      MockTierConfig.findOneAndUpdate.mockResolvedValue({ tier: 'silver', minSpend: 10000, minVisits: 5, discountPct: 5 })
      const result = await loyaltyService.upsertTierConfig('silver', { minSpend: 10000, minVisits: 5, discountPct: 5 })
      expect(result.tier).toBe('silver')
    })
  })

  describe('createCoupon', () => {
    it('creates coupon for customer', async () => {
      MockCustomer.findById.mockReturnValue(chain({ _id: 'cust_1' }))
      MockCoupon.findOne.mockResolvedValue(null)
      MockCoupon.create.mockResolvedValue(makeCoupon({ code: 'SAVE20' }))

      const result = await loyaltyService.createCoupon({
        code: 'SAVE20', customerId: 'cust_1', type: 'percentage', value: 20, expiresAt: new Date(Date.now() + 86400000),
      })

      expect(MockCoupon.create).toHaveBeenCalledWith(expect.objectContaining({ code: 'SAVE20' }))
      expect(result.code).toBe('SAVE20')
    })

    it('throws BadRequestError for duplicate code', async () => {
      MockCustomer.findById.mockReturnValue(chain({ _id: 'cust_1' }))
      MockCoupon.findOne.mockResolvedValue(makeCoupon())
      await expect(loyaltyService.createCoupon({
        code: 'SAVE10', customerId: 'cust_1', type: 'percentage', value: 10, expiresAt: new Date(),
      })).rejects.toBeInstanceOf(BadRequestError)
    })
  })

  describe('applyCoupon', () => {
    it('applies percentage coupon and marks used', async () => {
      const coupon = { ...makeCoupon(), status: 'active', value: 10, type: 'percentage' as const, save: vi.fn().mockResolvedValue(true) }
      MockCoupon.findOne.mockResolvedValue(coupon)

      const result = await loyaltyService.applyCoupon('SAVE10', 'ord_1', 1000)

      expect(result.discount).toBe(100)
      expect(coupon.status).toBe('used')
    })

    it('throws NotFoundError for missing coupon', async () => {
      MockCoupon.findOne.mockResolvedValue(null)
      await expect(loyaltyService.applyCoupon('MISSING', 'ord_1', 1000)).rejects.toBeInstanceOf(NotFoundError)
    })

    it('throws BadRequestError for expired coupon', async () => {
      const coupon = { ...makeCoupon(), status: 'active' as const, expiresAt: new Date(Date.now() - 86400000), save: vi.fn().mockResolvedValue(true) }
      MockCoupon.findOne.mockResolvedValue(coupon)
      await expect(loyaltyService.applyCoupon('SAVE10', 'ord_1', 1000)).rejects.toBeInstanceOf(BadRequestError)
    })

    it('throws BadRequestError for used coupon', async () => {
      const coupon = { ...makeCoupon(), status: 'used' as const, save: vi.fn().mockResolvedValue(true) }
      MockCoupon.findOne.mockResolvedValue(coupon)
      await expect(loyaltyService.applyCoupon('SAVE10', 'ord_1', 1000)).rejects.toBeInstanceOf(BadRequestError)
    })
  })

  describe('getCustomerLoyaltySummary', () => {
    it('returns customer + tier + active coupon count', async () => {
      MockCustomer.findById.mockReturnValue(chain({ _id: 'cust_1', loyaltyTier: 'gold' }))
      MockTierConfig.findOne.mockReturnValue(chain({ tier: 'gold', discountPct: 10 }))
      MockCoupon.countDocuments.mockResolvedValue(0)

      const result = await loyaltyService.getCustomerLoyaltySummary('cust_1')

      expect(result.customer.loyaltyTier).toBe('gold')
      expect(result.activeCoupons).toBe(0)
    })

    it('throws NotFoundError for missing customer', async () => {
      MockCustomer.findById.mockReturnValue(chain(null))
      await expect(loyaltyService.getCustomerLoyaltySummary('missing')).rejects.toBeInstanceOf(NotFoundError)
    })
  })
})
