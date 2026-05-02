import { vi, describe, it, expect, beforeEach } from 'vitest'

vi.mock('./customer.model', () => ({
  Customer: {
    find: vi.fn(),
    findOne: vi.fn(),
    findById: vi.fn(),
    create: vi.fn(),
    findByIdAndUpdate: vi.fn(),
    countDocuments: vi.fn(),
  },
  LOYALTY_TIERS: ['bronze', 'silver', 'gold', 'platinum'],
}))

function chain(value: unknown) {
  return { sort: vi.fn().mockReturnThis(), limit: vi.fn().mockReturnThis(), skip: vi.fn().mockReturnThis(), lean: vi.fn().mockResolvedValue(value) }
}

vi.mock('../orders/order.model', () => ({
  Order: { find: vi.fn() },
}))

import * as customerService from './customer.service'
import { Customer } from './customer.model'
import { Order } from '../orders/order.model'
import { makeCustomer } from '../../../tests/helpers/mock-factory'
import { NotFoundError, ConflictError } from '../../utils/AppError'

const MockCustomer = vi.mocked(Customer as unknown as {
  find: ReturnType<typeof vi.fn>
  findOne: ReturnType<typeof vi.fn>
  findById: ReturnType<typeof vi.fn>
  create: ReturnType<typeof vi.fn>
  findByIdAndUpdate: ReturnType<typeof vi.fn>
  countDocuments: ReturnType<typeof vi.fn>
})

const MockOrder = vi.mocked(Order as unknown as {
  find: ReturnType<typeof vi.fn>
})

describe('Customer Service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('createCustomer', () => {
    it('creates a new customer', async () => {
      MockCustomer.findOne.mockResolvedValue(null)
      MockCustomer.create.mockResolvedValue(makeCustomer())

      const result = await customerService.createCustomer({ name: 'Alice', phone: '9876543210' })

      expect(MockCustomer.create).toHaveBeenCalledWith(expect.objectContaining({ phone: '9876543210' }))
      expect(result.phone).toBe('9876543210')
    })

    it('throws ConflictError for duplicate phone', async () => {
      MockCustomer.findOne.mockResolvedValue(makeCustomer())
      await expect(customerService.createCustomer({ name: 'Alice', phone: '9876543210' })).rejects.toBeInstanceOf(ConflictError)
    })
  })

  describe('getCustomerByPhone', () => {
    it('finds by phone', async () => {
      MockCustomer.findOne.mockReturnValue(chain(makeCustomer()))
      const result = await customerService.getCustomerByPhone('9876543210')
      expect(result.phone).toBe('9876543210')
    })

    it('throws NotFoundError when missing', async () => {
      MockCustomer.findOne.mockReturnValue(chain(null))
      await expect(customerService.getCustomerByPhone('000')).rejects.toBeInstanceOf(NotFoundError)
    })
  })

  describe('updateCustomerStats', () => {
    it('increments visitCount and totalSpend, upgrades tier', async () => {
      const customer = makeCustomer({ visitCount: 4, totalSpend: 9000, loyaltyTier: 'bronze', save: vi.fn().mockResolvedValue(true) })
      MockCustomer.findById.mockResolvedValue(customer)

      const result = await customerService.updateCustomerStats('cust_1', 1500)

      expect(customer.visitCount).toBe(5)
      expect(customer.totalSpend).toBe(10500)
      expect(customer.loyaltyTier).toBe('silver')
    })
  })

  describe('getCustomerOrders', () => {
    it('returns orders by customer phone', async () => {
      const orders = [{ _id: 'ord_1' }]
      MockOrder.find.mockReturnValue({ sort: vi.fn().mockReturnThis(), lean: vi.fn().mockResolvedValue(orders) })

      const result = await customerService.getCustomerOrders('9876543210')
      expect(result.total).toBe(1)
    })
  })
})
