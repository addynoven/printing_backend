import { Router } from 'express'
import { z } from 'zod'
import { BARCODE_TYPES } from './barcode.model'
import { asyncHandler } from '../../utils/asyncHandler'
import { authenticate } from '../../middleware/authenticate'
import { permit } from '../../middleware/authorize'
import { validate } from '../../middleware/validate'
import * as barcodeService from './barcode.service'

export const barcodeRouter = Router()

const generateSchema = z.object({
  orderId: z.string(),
  type:    z.enum(BARCODE_TYPES),
})

const scanSchema = z.object({
  action: z.string().min(1),
  notes:  z.string().optional(),
})

barcodeRouter.post('/generate',
  authenticate,
  permit('orders', 'read'),
  validate(generateSchema),
  asyncHandler(async (req, res) => {
    const barcode = await barcodeService.generateBarcode(req.body.orderId, req.body.type)
    res.status(201).json(barcode)
  })
)

barcodeRouter.get('/order/:orderId',
  authenticate,
  permit('orders', 'read'),
  asyncHandler(async (req, res) => {
    const result = await barcodeService.getBarcodesForOrder(req.params.orderId)
    res.json(result)
  })
)

barcodeRouter.get('/scan/:orderId',
  authenticate,
  permit('orders', 'read'),
  asyncHandler(async (req, res) => {
    const data = await barcodeService.getScanData(req.params.orderId)
    res.json(data)
  })
)

barcodeRouter.post('/scan/:orderId',
  authenticate,
  permit('tasks', 'update'),
  validate(scanSchema),
  asyncHandler(async (req, res) => {
    const result = await barcodeService.processScan(
      req.params.orderId,
      req.body.action,
      req.user._id,
      { notes: req.body.notes, ip: req.ip }
    )
    res.json(result)
  })
)
