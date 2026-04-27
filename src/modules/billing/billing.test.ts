import { vi, describe, it, expect, beforeEach } from 'vitest'

vi.mock('./bill.model', () => {
  const mockBill = {
    findById:       vi.fn(),
    find:           vi.fn(),
    create:         vi.fn(),
    countDocuments: vi.fn(),
  }
  return { Bill: mockBill, BILL_TYPES: ['raw', 'gst'] }
})

vi.mock('../orders/order.model', () => {
  const mockOrder = { findById: vi.fn() }
  return { Order: mockOrder }
})

import * as billingService from './billing.service'
import { Bill } from './bill.model'
import { Order } from '../orders/order.model'
import { makeBill, makeOrder } from '../../../tests/helpers/mock-factory'
import { NotFoundError } from '../../utils/AppError'

const MockBill = vi.mocked(Bill as unknown as {
  findById:       ReturnType<typeof vi.fn>
  find:           ReturnType<typeof vi.fn>
  create:         ReturnType<typeof vi.fn>
  countDocuments: ReturnType<typeof vi.fn>
})

const MockOrder = vi.mocked(Order as unknown as {
  findById: ReturnType<typeof vi.fn>
})

function chain(value: unknown) {
  return { lean: vi.fn().mockResolvedValue(value) }
}

const YEAR = new Date().getFullYear()

function makeRawBill(orderId: string, createdBy: string) {
  return makeBill({
    orderId,
    type:         'raw',
    seriesNumber: `RAW-${YEAR}-001`,
    amount:       500,
    isProtected:  true,
    createdBy,
    lineItems:    [{ description: 'Banner print', qty: 2, rate: 250, amount: 500 }],
  })
}

function makeGstBill(orderId: string, createdBy: string) {
  return makeBill({
    orderId,
    type:         'gst',
    seriesNumber: `TAX-${YEAR}-001`,
    amount:       300,
    isProtected:  false,
    createdBy,
    lineItems:    [{ description: 'Banner print', qty: 2, rate: 150, amount: 300 }],
    cgst:         27,
    sgst:         27,
    taxableAmount: 300,
    totalAmount:  354,
  })
}

describe('Billing Service — Unit Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ──────────────────────────────────────────────
  // createBill
  // ──────────────────────────────────────────────
  describe('createBill', () => {
    it('raw bill: seriesNumber matches RAW-YYYY-NNN format, amount=rawCost, isProtected=true', async () => {
      const orderId   = 'ord_001'
      const createdBy = 'usr_001'
      const order     = makeOrder({ rawCost: 500 })
      MockOrder.findById.mockReturnValue(chain(order))
      MockBill.countDocuments.mockResolvedValue(0)
      MockBill.create.mockResolvedValue(makeRawBill(orderId, createdBy))

      const result = await billingService.createBill({ orderId, type: 'raw', createdBy })

      expect(MockBill.create).toHaveBeenCalledWith(
        expect.objectContaining({
          orderId,
          type:        'raw',
          seriesNumber: `RAW-${YEAR}-001`,
          amount:       order.rawCost,
          isProtected:  true,
          createdBy,
        })
      )
      expect(result).toMatchObject({ type: 'raw', isProtected: true })
    })

    it('gst bill: seriesNumber matches TAX-YYYY-NNN format, amount=taxableValue, has cgst/sgst', async () => {
      const orderId   = 'ord_002'
      const createdBy = 'usr_001'
      const order     = makeOrder({ taxableValue: 300 })
      MockOrder.findById.mockReturnValue(chain(order))
      MockBill.countDocuments.mockResolvedValue(0)
      MockBill.create.mockResolvedValue(makeGstBill(orderId, createdBy))

      const result = await billingService.createBill({ orderId, type: 'gst', createdBy })

      expect(MockBill.create).toHaveBeenCalledWith(
        expect.objectContaining({
          type:         'gst',
          seriesNumber: `TAX-${YEAR}-001`,
          amount:       order.taxableValue,
          cgst:         expect.any(Number),
          sgst:         expect.any(Number),
        })
      )
      expect(result).toMatchObject({ type: 'gst', cgst: 27, sgst: 27 })
    })

    it('lineItems are populated from order.items', async () => {
      const orderId = 'ord_003'
      const order   = makeOrder({
        items: [{ description: 'Flex Banner', quantity: 5, unit: 'sqft', unitPrice: 100 }],
      })
      MockOrder.findById.mockReturnValue(chain(order))
      MockBill.countDocuments.mockResolvedValue(0)
      MockBill.create.mockResolvedValue(makeRawBill(orderId, 'usr_001'))

      await billingService.createBill({ orderId, type: 'raw', createdBy: 'usr_001' })

      expect(MockBill.create).toHaveBeenCalledWith(
        expect.objectContaining({
          lineItems: [{ description: 'Flex Banner', qty: 5, rate: 100, amount: 500 }],
        })
      )
    })

    it('seriesNumber sequence increments by count of existing bills of same type', async () => {
      const order = makeOrder()
      MockOrder.findById.mockReturnValue(chain(order))
      MockBill.countDocuments.mockResolvedValue(4) // 4 existing raw bills → 5th = 005
      MockBill.create.mockResolvedValue(makeRawBill('ord_001', 'usr_001'))

      await billingService.createBill({ orderId: 'ord_001', type: 'raw', createdBy: 'usr_001' })

      expect(MockBill.create).toHaveBeenCalledWith(
        expect.objectContaining({ seriesNumber: `RAW-${YEAR}-005` })
      )
    })

    it('throws NotFoundError when order not found', async () => {
      MockOrder.findById.mockReturnValue(chain(null))

      await expect(
        billingService.createBill({ orderId: 'nonexistent', type: 'raw', createdBy: 'usr_001' })
      ).rejects.toBeInstanceOf(NotFoundError)
    })
  })

  // ──────────────────────────────────────────────
  // getBillById
  // ──────────────────────────────────────────────
  describe('getBillById', () => {
    it('returns bill when found', async () => {
      const bill = makeRawBill('ord_001', 'usr_001')
      MockBill.findById.mockReturnValue(chain(bill))

      const result = await billingService.getBillById('bill_001')

      expect(result).toMatchObject({ type: 'raw', isProtected: true })
    })

    it('throws NotFoundError when bill does not exist', async () => {
      MockBill.findById.mockReturnValue(chain(null))

      await expect(billingService.getBillById('nonexistent_id')).rejects.toBeInstanceOf(NotFoundError)
    })
  })

  // ──────────────────────────────────────────────
  // listBillsForOrder
  // ──────────────────────────────────────────────
  describe('listBillsForOrder', () => {
    it('returns { bills, total } for the given orderId', async () => {
      const orderId = 'ord_001'
      const bills   = [makeRawBill(orderId, 'usr_001'), makeGstBill(orderId, 'usr_001')]
      MockBill.find.mockReturnValue(chain(bills))

      const result = await billingService.listBillsForOrder(orderId)

      expect(MockBill.find).toHaveBeenCalledWith(expect.objectContaining({ orderId }))
      expect(result).toMatchObject({ bills, total: 2 })
    })

    it('returns empty array when order has no bills', async () => {
      MockBill.find.mockReturnValue(chain([]))

      const result = await billingService.listBillsForOrder('ord_empty')

      expect(result).toMatchObject({ bills: [], total: 0 })
    })
  })
})
