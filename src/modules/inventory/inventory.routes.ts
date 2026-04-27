import { Router } from 'express'
import { z } from 'zod'
import { MATERIAL_CATEGORIES, MATERIAL_UNITS } from './material.model'
import { asyncHandler } from '../../utils/asyncHandler'
import { authenticate } from '../../middleware/authenticate'
import { permit } from '../../middleware/authorize'
import { validate } from '../../middleware/validate'
import * as inventoryService from './inventory.service'

export const inventoryRouter = Router()

const createMaterialSchema = z.object({
  name:        z.string().min(2),
  category:    z.enum(MATERIAL_CATEGORIES),
  unit:        z.enum(MATERIAL_UNITS),
  stock:       z.number().min(0).optional(),
  threshold:   z.number().min(0),
  costPerUnit: z.number().positive(),
  supplier: z.object({
    name:  z.string().optional(),
    phone: z.string().optional(),
    email: z.string().email().optional(),
  }).optional(),
})

const updateMaterialSchema = z.object({
  name:        z.string().min(2).optional(),
  category:    z.enum(MATERIAL_CATEGORIES).optional(),
  threshold:   z.number().min(0).optional(),
  costPerUnit: z.number().positive().optional(),
  supplier: z.object({
    name:  z.string().optional(),
    phone: z.string().optional(),
    email: z.string().email().optional(),
  }).optional(),
})

const restockSchema = z.object({
  qty:  z.number().positive(),
  note: z.string().optional(),
})

inventoryRouter.get('/alerts',
  authenticate,
  permit('inventory', 'read'),
  asyncHandler(async (_req, res) => {
    const result = await inventoryService.getLowStockAlerts()
    res.json(result)
  })
)

inventoryRouter.get('/',
  authenticate,
  permit('inventory', 'read'),
  asyncHandler(async (req, res) => {
    const { category, isActive } = req.query
    const query: inventoryService.ListMaterialsQuery = {}

    if (typeof category === 'string') query.category = category as inventoryService.ListMaterialsQuery['category']
    if (typeof isActive === 'string') query.isActive = isActive === 'true'

    const result = await inventoryService.listMaterials(query)
    res.json(result)
  })
)

inventoryRouter.post('/',
  authenticate,
  permit('inventory', 'create'),
  validate(createMaterialSchema),
  asyncHandler(async (req, res) => {
    const material = await inventoryService.createMaterial(req.body)
    res.status(201).json(material)
  })
)

inventoryRouter.get('/:id',
  authenticate,
  permit('inventory', 'read'),
  asyncHandler(async (req, res) => {
    const material = await inventoryService.getMaterialById(req.params.id)
    res.json(material)
  })
)

inventoryRouter.patch('/:id',
  authenticate,
  permit('inventory', 'update'),
  validate(updateMaterialSchema),
  asyncHandler(async (req, res) => {
    const material = await inventoryService.updateMaterial(req.params.id, req.body)
    res.json(material)
  })
)

inventoryRouter.post('/:id/restock',
  authenticate,
  permit('inventory', 'update'),
  validate(restockSchema),
  asyncHandler(async (req, res) => {
    const result = await inventoryService.restock(
      req.params.id,
      req.body.qty,
      req.user._id,
      req.body.note
    )
    res.json(result)
  })
)

inventoryRouter.get('/:id/ledger',
  authenticate,
  permit('inventory', 'read'),
  asyncHandler(async (req, res) => {
    const result = await inventoryService.getLedger(req.params.id)
    res.json(result)
  })
)
