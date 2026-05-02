import { Router } from 'express'
import { z } from 'zod'
import { LOYALTY_TIERS } from './customer.model'
import { asyncHandler } from '../../utils/asyncHandler'
import { authenticate } from '../../middleware/authenticate'
import { permit } from '../../middleware/authorize'
import { validate } from '../../middleware/validate'
import * as customerService from './customer.service'

export const customerRouter = Router()

const createSchema = z.object({
  name:  z.string().min(1),
  phone: z.string().min(7),
  email: z.string().email().optional(),
})

const updateSchema = z.object({
  name:  z.string().min(1).optional(),
  phone: z.string().min(7).optional(),
  email: z.string().email().optional(),
})

customerRouter.get('/',
  authenticate,
  permit('customers', 'read'),
  asyncHandler(async (req, res) => {
    const { search, tier, limit, skip } = req.query
    const result = await customerService.listCustomers({
      search: typeof search === 'string' ? search : undefined,
      tier: tier && LOYALTY_TIERS.includes(tier as typeof LOYALTY_TIERS[number]) ? (tier as typeof LOYALTY_TIERS[number]) : undefined,
      limit: typeof limit === 'string' ? parseInt(limit, 10) : undefined,
      skip: typeof skip === 'string' ? parseInt(skip, 10) : undefined,
    })
    res.json(result)
  })
)

customerRouter.post('/',
  authenticate,
  permit('customers', 'create'),
  validate(createSchema),
  asyncHandler(async (req, res) => {
    const customer = await customerService.createCustomer(req.body)
    res.status(201).json(customer)
  })
)

customerRouter.get('/phone/:phone',
  authenticate,
  permit('customers', 'read'),
  asyncHandler(async (req, res) => {
    const customer = await customerService.getCustomerByPhone(req.params.phone)
    res.json(customer)
  })
)

customerRouter.get('/:id',
  authenticate,
  permit('customers', 'read'),
  asyncHandler(async (req, res) => {
    const customer = await customerService.getCustomerById(req.params.id)
    res.json(customer)
  })
)

customerRouter.patch('/:id',
  authenticate,
  permit('customers', 'update'),
  validate(updateSchema),
  asyncHandler(async (req, res) => {
    const customer = await customerService.updateCustomer(req.params.id, req.body)
    res.json(customer)
  })
)

customerRouter.delete('/:id',
  authenticate,
  permit('customers', 'delete'),
  asyncHandler(async (req, res) => {
    await customerService.deleteCustomer(req.params.id)
    res.status(204).send()
  })
)

customerRouter.get('/:id/orders',
  authenticate,
  permit('customers', 'read'),
  asyncHandler(async (req, res) => {
    const customer = await customerService.getCustomerById(req.params.id)
    const orders = await customerService.getCustomerOrders(customer.phone)
    res.json(orders)
  })
)
