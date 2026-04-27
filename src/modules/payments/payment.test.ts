import { vi, describe, it, expect, beforeEach } from 'vitest'

vi.mock('./payment.model', () => {
  const mockPayment = {
    create:            vi.fn(),
    find:              vi.fn(),
    findById:          vi.fn(),
    findByIdAndUpdate: vi.fn(),
  }
  return { Payment: mockPayment }
})

import * as paymentService from './payment.service'
import { Payment } from './payment.model'
import { makePayment } from '../../../tests/helpers/mock-factory'
import { NotFoundError } from '../../utils/AppError'

const MockPayment = vi.mocked(Payment as unknown as {
  create:            ReturnType<typeof vi.fn>
  find:              ReturnType<typeof vi.fn>
  findById:          ReturnType<typeof vi.fn>
  findByIdAndUpdate: ReturnType<typeof vi.fn>
})

function chain(value: unknown) {
  return { lean: vi.fn().mockResolvedValue(value) }
}

describe('Payment Service — Unit Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ──────────────────────────────────────────────
  // createPayment
  // ──────────────────────────────────────────────
  describe('createPayment', () => {
    it('creates payment with correct fields', async () => {
      const input = {
        orderId:     'ord_001',
        type:        'advance' as const,
        amount:      500,
        method:      'cash' as const,
        collectedBy: 'usr_001',
      }
      const created = makePayment({ orderId: 'ord_001', collectedBy: 'usr_001' })
      MockPayment.create.mockResolvedValue(created)

      const result = await paymentService.createPayment(input)

      expect(MockPayment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          orderId:     'ord_001',
          type:        'advance',
          amount:      500,
          method:      'cash',
          collectedBy: 'usr_001',
        })
      )
      expect(result).toMatchObject({ orderId: 'ord_001', collectedBy: 'usr_001' })
    })

    it('status defaults to completed', async () => {
      const input = {
        orderId:     'ord_001',
        type:        'final' as const,
        amount:      1000,
        method:      'upi' as const,
        collectedBy: 'usr_001',
      }
      const created = makePayment({ status: 'completed' })
      MockPayment.create.mockResolvedValue(created)

      await paymentService.createPayment(input)

      expect(MockPayment.create).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'completed' })
      )
    })

    it('paidAt is set to now on creation', async () => {
      const before = Date.now()
      const input = {
        orderId:     'ord_001',
        type:        'partial' as const,
        amount:      200,
        method:      'card' as const,
        collectedBy: 'usr_001',
      }
      const created = makePayment({ paidAt: new Date() })
      MockPayment.create.mockResolvedValue(created)

      await paymentService.createPayment(input)

      const callArg = MockPayment.create.mock.calls[0][0] as { paidAt: Date }
      expect(callArg.paidAt.getTime()).toBeGreaterThanOrEqual(before)
      expect(callArg.paidAt.getTime()).toBeLessThanOrEqual(Date.now())
    })
  })

  // ──────────────────────────────────────────────
  // listPayments
  // ──────────────────────────────────────────────
  describe('listPayments', () => {
    it('returns { payments, total }', async () => {
      const payments = [makePayment({ orderId: 'ord_001' }), makePayment({ orderId: 'ord_002' })]
      MockPayment.find.mockReturnValue(chain(payments))

      const result = await paymentService.listPayments()

      expect(result).toHaveProperty('payments')
      expect(result).toHaveProperty('total')
      expect(result.payments).toHaveLength(2)
      expect(result.total).toBe(2)
    })
  })

  // ──────────────────────────────────────────────
  // getPaymentsForOrder
  // ──────────────────────────────────────────────
  describe('getPaymentsForOrder', () => {
    it('returns { payments, total } for given orderId', async () => {
      const orderId = 'ord_abc'
      const payments = [makePayment({ orderId }), makePayment({ orderId })]
      MockPayment.find.mockReturnValue(chain(payments))

      const result = await paymentService.getPaymentsForOrder(orderId)

      expect(MockPayment.find).toHaveBeenCalledWith(expect.objectContaining({ orderId }))
      expect(result).toHaveProperty('payments')
      expect(result).toHaveProperty('total')
      expect(result.total).toBe(2)
    })
  })

  // ──────────────────────────────────────────────
  // refundPayment
  // ──────────────────────────────────────────────
  describe('refundPayment', () => {
    it('sets status to refunded and returns updated payment', async () => {
      const updated = makePayment({ status: 'refunded' })
      MockPayment.findByIdAndUpdate.mockReturnValue(chain(updated))

      const result = await paymentService.refundPayment('pay_001')

      expect(MockPayment.findByIdAndUpdate).toHaveBeenCalledWith(
        'pay_001',
        expect.objectContaining({ status: 'refunded' }),
        expect.objectContaining({ new: true })
      )
      expect(result).toMatchObject({ status: 'refunded' })
    })

    it('throws NotFoundError when payment not found', async () => {
      MockPayment.findByIdAndUpdate.mockReturnValue(chain(null))

      await expect(paymentService.refundPayment('missing_id')).rejects.toBeInstanceOf(NotFoundError)
    })
  })
})
