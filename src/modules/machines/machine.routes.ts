import { Router } from 'express'
import { z } from 'zod'
import { MACHINE_TYPES, MACHINE_STATUSES } from './machine.model'
import { asyncHandler } from '../../utils/asyncHandler'
import { authenticate } from '../../middleware/authenticate'
import { permit } from '../../middleware/authorize'
import { validate } from '../../middleware/validate'
import * as machineService from './machine.service'

export const machineRouter = Router()

const createMachineSchema = z.object({
  name:       z.string().min(2),
  type:       z.enum(MACHINE_TYPES),
  department: z.string().min(2),
  status:     z.enum(MACHINE_STATUSES).optional(),
  notes:      z.string().optional(),
})

const updateMachineSchema = z.object({
  name:       z.string().min(2).optional(),
  department: z.string().min(2).optional(),
  notes:      z.string().optional(),
})

const setStatusSchema = z.object({
  status: z.enum(MACHINE_STATUSES),
})

machineRouter.get('/',
  authenticate,
  permit('machines', 'read'),
  asyncHandler(async (req, res) => {
    const { type, status } = req.query

    const query: machineService.ListMachinesQuery = {}
    if (typeof type === 'string')   query.type   = type   as machineService.ListMachinesQuery['type']
    if (typeof status === 'string') query.status = status as machineService.ListMachinesQuery['status']

    const result = await machineService.listMachines(query)
    res.json(result)
  })
)

machineRouter.post('/',
  authenticate,
  permit('machines', 'create'),
  validate(createMachineSchema),
  asyncHandler(async (req, res) => {
    const machine = await machineService.createMachine(req.body)
    res.status(201).json(machine)
  })
)

machineRouter.patch('/:id',
  authenticate,
  permit('machines', 'update'),
  validate(updateMachineSchema),
  asyncHandler(async (req, res) => {
    const machine = await machineService.updateMachine(req.params.id, req.body)
    res.json(machine)
  })
)

machineRouter.patch('/:id/status',
  authenticate,
  permit('machines', 'update'),
  validate(setStatusSchema),
  asyncHandler(async (req, res) => {
    const machine = await machineService.setMachineStatus(req.params.id, req.body.status)
    res.json(machine)
  })
)
