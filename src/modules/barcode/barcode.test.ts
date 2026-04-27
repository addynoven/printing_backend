import { vi, describe, it, expect, beforeEach } from 'vitest'

vi.mock('./barcode.model', () => {
  const mockBarcode = {
    findOne:  vi.fn(),
    find:     vi.fn(),
    create:   vi.fn(),
    countDocuments: vi.fn(),
  }
  const mockScanEvent = {
    findOne: vi.fn(),
    find:    vi.fn(),
    create:  vi.fn(),
  }
  return { Barcode: mockBarcode, ScanEvent: mockScanEvent, BARCODE_TYPES: ['initial', 'final'] }
})

vi.mock('qrcode', () => ({
  toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,fake'),
}))

vi.mock('../orders/order.model', () => {
  const mockOrder = { findById: vi.fn() }
  return { Order: mockOrder }
})

import * as barcodeService from './barcode.service'
import { Barcode, ScanEvent } from './barcode.model'
import { Order } from '../orders/order.model'
import * as QRCode from 'qrcode'
import { makeBarcode, makeOrder } from '../../../tests/helpers/mock-factory'
import { NotFoundError } from '../../utils/AppError'

const MockBarcode = vi.mocked(Barcode as unknown as {
  findOne:        ReturnType<typeof vi.fn>
  find:           ReturnType<typeof vi.fn>
  create:         ReturnType<typeof vi.fn>
  countDocuments: ReturnType<typeof vi.fn>
})

const MockScanEvent = vi.mocked(ScanEvent as unknown as {
  findOne: ReturnType<typeof vi.fn>
  find:    ReturnType<typeof vi.fn>
  create:  ReturnType<typeof vi.fn>
})

const MockQRCode = vi.mocked(QRCode as unknown as { toDataURL: ReturnType<typeof vi.fn> })

const MockOrder = vi.mocked(Order as unknown as {
  findById: ReturnType<typeof vi.fn>
})

function chain(value: unknown) {
  return { lean: vi.fn().mockResolvedValue(value) }
}

describe('Barcode Service — Unit Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ──────────────────────────────────────────────
  // generateBarcode
  // ──────────────────────────────────────────────
  describe('generateBarcode(orderId, type)', () => {
    it('calls QRCode.toDataURL with orderId as the encoded value', async () => {
      const orderId = 'order_abc123'
      const saved = makeBarcode({ orderId, type: 'initial', code: orderId, qrDataUrl: 'data:image/png;base64,fake' })
      MockBarcode.create.mockResolvedValue(saved)

      await barcodeService.generateBarcode(orderId, 'initial')

      expect(MockQRCode.toDataURL).toHaveBeenCalledWith(orderId)
    })

    it('creates Barcode doc with code=orderId, qrDataUrl=result, type=type', async () => {
      const orderId = 'order_abc123'
      const saved = makeBarcode({ orderId, type: 'final', code: orderId, qrDataUrl: 'data:image/png;base64,fake' })
      MockBarcode.create.mockResolvedValue(saved)

      await barcodeService.generateBarcode(orderId, 'final')

      expect(MockBarcode.create).toHaveBeenCalledWith(expect.objectContaining({
        orderId,
        code:      orderId,
        qrDataUrl: 'data:image/png;base64,fake',
        type:      'final',
      }))
    })

    it('returns the saved barcode', async () => {
      const orderId = 'order_abc123'
      const saved = makeBarcode({ orderId, type: 'initial', code: orderId, qrDataUrl: 'data:image/png;base64,fake' })
      MockBarcode.create.mockResolvedValue(saved)

      const result = await barcodeService.generateBarcode(orderId, 'initial')

      expect(result).toEqual(saved)
    })
  })

  // ──────────────────────────────────────────────
  // getBarcodesForOrder
  // ──────────────────────────────────────────────
  describe('getBarcodesForOrder(orderId)', () => {
    it('returns { barcodes, total } for the given orderId', async () => {
      const orderId = 'order_xyz'
      const list = [
        makeBarcode({ orderId, type: 'initial' }),
        makeBarcode({ orderId, type: 'final' }),
      ]
      MockBarcode.find.mockResolvedValue(list)
      MockBarcode.countDocuments.mockResolvedValue(2)

      const result = await barcodeService.getBarcodesForOrder(orderId)

      expect(result).toMatchObject({ barcodes: list, total: 2 })
    })

    it('queries Barcode model with the given orderId', async () => {
      const orderId = 'order_xyz'
      MockBarcode.find.mockResolvedValue([])
      MockBarcode.countDocuments.mockResolvedValue(0)

      await barcodeService.getBarcodesForOrder(orderId)

      expect(MockBarcode.find).toHaveBeenCalledWith(expect.objectContaining({ orderId }))
    })
  })

  // ──────────────────────────────────────────────
  // processScan
  // ──────────────────────────────────────────────
  describe('processScan(orderId, action, scannedBy, opts)', () => {
    it('creates ScanEvent with orderId, action, scannedBy, ip, notes', async () => {
      const orderId   = 'aaaaaaaaaaaaaaaaaaaaaaaa'
      const action    = 'in_progress'
      const scannedBy = 'user_001'
      const opts      = { ip: '192.168.1.1', notes: 'Scan at gate' }
      const created   = { orderId, action, scannedBy, ip: opts.ip, notes: opts.notes }
      MockOrder.findById.mockReturnValue(chain(makeOrder()))
      MockScanEvent.create.mockResolvedValue(created)

      await barcodeService.processScan(orderId, action, scannedBy, opts)

      expect(MockScanEvent.create).toHaveBeenCalledWith(expect.objectContaining({
        orderId,
        action,
        scannedBy,
        ip:    opts.ip,
        notes: opts.notes,
      }))
    })

    it('returns { scanEvent } after recording the scan', async () => {
      const orderId = 'aaaaaaaaaaaaaaaaaaaaaaaa'
      const created = { orderId, action: 'done', scannedBy: 'user_001' }
      MockOrder.findById.mockReturnValue(chain(makeOrder()))
      MockScanEvent.create.mockResolvedValue(created)

      const result = await barcodeService.processScan(orderId, 'done', 'user_001')

      expect(result).toMatchObject({ scanEvent: created })
    })

    it('works without optional opts', async () => {
      const orderId = 'aaaaaaaaaaaaaaaaaaaaaaaa'
      const created = { orderId, action: 'done', scannedBy: 'user_001' }
      MockOrder.findById.mockReturnValue(chain(makeOrder()))
      MockScanEvent.create.mockResolvedValue(created)

      await expect(
        barcodeService.processScan(orderId, 'done', 'user_001')
      ).resolves.not.toThrow()
    })

    it('throws NotFoundError when order not found', async () => {
      MockOrder.findById.mockReturnValue(chain(null))

      await expect(
        barcodeService.processScan('aaaaaaaaaaaaaaaaaaaaaaaa', 'done', 'user_001')
      ).rejects.toBeInstanceOf(NotFoundError)
    })
  })

  // ──────────────────────────────────────────────
  // getScanData
  // ──────────────────────────────────────────────
  describe('getScanData(orderId)', () => {
    it('returns { order } for the given orderId', async () => {
      const order = makeOrder()
      MockOrder.findById.mockReturnValue(chain(order))

      const result = await barcodeService.getScanData('aaaaaaaaaaaaaaaaaaaaaaaa')

      expect(result).toMatchObject({ order })
    })

    it('throws NotFoundError when order not found', async () => {
      MockOrder.findById.mockReturnValue(chain(null))

      await expect(
        barcodeService.getScanData('000000000000000000000001')
      ).rejects.toBeInstanceOf(NotFoundError)
    })
  })
})
