import * as QRCode from 'qrcode'
import { Barcode, ScanEvent, BarcodeType } from './barcode.model'
import { Order } from '../orders/order.model'
import { NotFoundError } from '../../utils/AppError'

export async function generateBarcode(orderId: string, type: BarcodeType) {
  const qrDataUrl = await QRCode.toDataURL(orderId)
  return await Barcode.create({ orderId, code: orderId, qrDataUrl, type })
}

export async function getBarcodesForOrder(orderId: string) {
  const [barcodes, total] = await Promise.all([
    Barcode.find({ orderId }),
    Barcode.countDocuments({ orderId }),
  ])
  return { barcodes, total }
}

export async function processScan(
  orderId: string,
  action: string,
  scannedBy: string,
  opts?: { notes?: string; ip?: string }
) {
  const order = await Order.findById(orderId).lean()
  if (!order) throw new NotFoundError('Order not found')

  const scanEvent = await ScanEvent.create({
    orderId,
    action,
    scannedBy,
    ip:    opts?.ip,
    notes: opts?.notes,
  })
  return { scanEvent }
}

export async function getScanData(orderId: string) {
  const order = await Order.findById(orderId).lean()
  if (!order) throw new NotFoundError('Order not found')
  return { order }
}
