import { vi, describe, it, expect, beforeEach } from 'vitest'

vi.mock('./order.model', () => {
  const mockOrder = {
    find:              vi.fn(),
    findById:          vi.fn(),
    create:            vi.fn(),
    findByIdAndUpdate: vi.fn(),
  }
  return { Order: mockOrder }
})

vi.mock('./order.statemachine', () => ({
  transitionOrder: vi.fn(),
  canTransition:   vi.fn(),
}))

import * as orderService from './order.service'
import { Order } from './order.model'
import { transitionOrder } from './order.statemachine'
import { makeOrder } from '../../../tests/helpers/mock-factory'
import { NotFoundError } from '../../utils/AppError'
import { Types } from 'mongoose'

// ── Type-safe mock access ──────────────────────────────────────────────────
const MockOrder = vi.mocked(Order as unknown as {
  find:              ReturnType<typeof vi.fn>
  findById:          ReturnType<typeof vi.fn>
  create:            ReturnType<typeof vi.fn>
  findByIdAndUpdate: ReturnType<typeof vi.fn>
})

const MockTransitionOrder = vi.mocked(transitionOrder)

// ── Helpers ────────────────────────────────────────────────────────────────
function chain(value: unknown) {
  return {
    sort:   vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    lean:   vi.fn().mockResolvedValue(value),
  }
}

function makeOrderDoc(overrides: Record<string, unknown> = {}) {
  return {
    _id:    new Types.ObjectId().toString(),
    status: 'draft',
    statusHistory: [{
      status:    'draft',
      changedBy: new Types.ObjectId(),
      at:        new Date(),
    }],
    ...makeOrder(),
    ...overrides,
  }
}

// ── Order Service Unit Tests ───────────────────────────────────────────────
describe('Order Service — Unit Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ── listOrders ────────────────────────────────────────────────────────────
  describe('listOrders', () => {
    it('returns all orders when no filter', async () => {
      const docs = [makeOrderDoc(), makeOrderDoc()]
      MockOrder.find.mockReturnValue(chain(docs))

      const result = await orderService.listOrders({})

      expect(MockOrder.find).toHaveBeenCalledWith({})
      expect(result.orders).toHaveLength(2)
      expect(result.total).toBe(2)
    })

    it('filters by status', async () => {
      MockOrder.find.mockReturnValue(chain([]))
      await orderService.listOrders({ status: 'confirmed' })
      expect(MockOrder.find).toHaveBeenCalledWith(expect.objectContaining({ status: 'confirmed' }))
    })

    it('filters by jobType', async () => {
      MockOrder.find.mockReturnValue(chain([]))
      await orderService.listOrders({ jobType: 'design' })
      expect(MockOrder.find).toHaveBeenCalledWith(expect.objectContaining({ jobType: 'design' }))
    })

    it('filters by priority', async () => {
      MockOrder.find.mockReturnValue(chain([]))
      await orderService.listOrders({ priority: 'urgent' })
      expect(MockOrder.find).toHaveBeenCalledWith(expect.objectContaining({ priority: 'urgent' }))
    })

    it('filters by ownerId — sets $or on createdBy/assignedTo', async () => {
      MockOrder.find.mockReturnValue(chain([]))
      const ownerId = new Types.ObjectId().toString()
      await orderService.listOrders({ ownerId })
      expect(MockOrder.find).toHaveBeenCalledWith(expect.objectContaining({ $or: expect.any(Array) }))
    })

    it('applies date range filter when from and to provided', async () => {
      MockOrder.find.mockReturnValue(chain([]))
      await orderService.listOrders({ from: '2024-01-01', to: '2024-12-31' })
      const callArg = MockOrder.find.mock.calls[0][0] as Record<string, unknown>
      expect(callArg.createdAt).toMatchObject({ $gte: expect.any(Date), $lte: expect.any(Date) })
    })

    it('applies only $gte when only from is provided', async () => {
      MockOrder.find.mockReturnValue(chain([]))
      await orderService.listOrders({ from: '2024-06-01' })
      const callArg = MockOrder.find.mock.calls[0][0] as Record<string, unknown>
      expect((callArg.createdAt as Record<string, unknown>).$gte).toBeInstanceOf(Date)
      expect((callArg.createdAt as Record<string, unknown>).$lte).toBeUndefined()
    })
  })

  // ── createOrder ───────────────────────────────────────────────────────────
  describe('createOrder', () => {
    it('creates order and returns it', async () => {
      const createdBy = new Types.ObjectId().toString()
      const doc = makeOrderDoc({ createdBy })
      MockOrder.create.mockResolvedValue(doc)

      const result = await orderService.createOrder({
        ...makeOrder(),
        items: [{ description: 'Banner', quantity: 2, unit: 'pcs', unitPrice: 250 }],
        createdBy,
      })

      expect(MockOrder.create).toHaveBeenCalledTimes(1)
      expect(result).toMatchObject({ status: 'draft' })
    })

    it('statusHistory has initial draft entry', async () => {
      const createdBy = new Types.ObjectId().toString()
      const doc = makeOrderDoc({ createdBy })
      MockOrder.create.mockResolvedValue(doc)

      await orderService.createOrder({
        ...makeOrder(),
        items: [{ description: 'Banner', quantity: 1, unit: 'pcs', unitPrice: 100 }],
        createdBy,
      })

      const createArg = MockOrder.create.mock.calls[0][0] as Record<string, unknown>
      const history = createArg.statusHistory as Array<Record<string, unknown>>
      expect(history).toHaveLength(1)
      expect(history[0].status).toBe('draft')
    })
  })

  // ── getOrderById ──────────────────────────────────────────────────────────
  describe('getOrderById', () => {
    it('returns order when found', async () => {
      const doc = makeOrderDoc()
      MockOrder.findById.mockReturnValue(chain(doc))

      const result = await orderService.getOrderById('some_id')

      expect(result).toMatchObject({ status: 'draft' })
    })

    it('throws NotFoundError when not found', async () => {
      MockOrder.findById.mockReturnValue(chain(null))
      await expect(orderService.getOrderById('bad_id')).rejects.toBeInstanceOf(NotFoundError)
    })
  })

  // ── updateOrder ───────────────────────────────────────────────────────────
  describe('updateOrder', () => {
    it('updates fields and returns updated order', async () => {
      const updated = makeOrderDoc({ notes: 'Rush job', priority: 'urgent' })
      MockOrder.findByIdAndUpdate.mockReturnValue(chain(updated))

      const result = await orderService.updateOrder('some_id', { notes: 'Rush job', priority: 'urgent' })

      expect(MockOrder.findByIdAndUpdate).toHaveBeenCalledWith(
        'some_id',
        { notes: 'Rush job', priority: 'urgent' },
        expect.objectContaining({ new: true, runValidators: true })
      )
      expect(result).toMatchObject({ notes: 'Rush job' })
    })

    it('throws NotFoundError when order not found', async () => {
      MockOrder.findByIdAndUpdate.mockReturnValue(chain(null))
      await expect(orderService.updateOrder('bad_id', { notes: 'x' })).rejects.toBeInstanceOf(NotFoundError)
    })
  })

  // ── setOrderStatus ────────────────────────────────────────────────────────
  describe('setOrderStatus', () => {
    it('delegates to transitionOrder with correct args', async () => {
      const doc = makeOrderDoc({ status: 'confirmed' })
      MockTransitionOrder.mockResolvedValue(doc as never)

      await orderService.setOrderStatus('order_id', 'confirmed', 'actor_id', 'Auto confirm')

      expect(MockTransitionOrder).toHaveBeenCalledWith('order_id', 'confirmed', 'actor_id', 'Auto confirm')
    })
  })

  // ── getTimeline ───────────────────────────────────────────────────────────
  describe('getTimeline', () => {
    it('returns statusHistory array', async () => {
      const history = [
        { status: 'draft',     changedBy: new Types.ObjectId(), at: new Date() },
        { status: 'confirmed', changedBy: new Types.ObjectId(), at: new Date() },
      ]
      MockOrder.findById.mockReturnValue(
        chain({ orderNumber: 'ORD-2024-0001', status: 'confirmed', statusHistory: history })
      )

      const result = await orderService.getTimeline('some_id')

      expect(result).toHaveLength(2)
      expect(result[0].status).toBe('draft')
      expect(result[1].status).toBe('confirmed')
    })

    it('throws NotFoundError when order not found', async () => {
      MockOrder.findById.mockReturnValue(chain(null))
      await expect(orderService.getTimeline('bad_id')).rejects.toBeInstanceOf(NotFoundError)
    })
  })
})
