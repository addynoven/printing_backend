import { Router } from 'express'
import { z } from 'zod'
import { ROLES } from '../../config/permissions'
import { asyncHandler } from '../../utils/asyncHandler'
import { authenticate } from '../../middleware/authenticate'
import { permit } from '../../middleware/authorize'
import { validate } from '../../middleware/validate'
import * as userService from './user.service'
import { logActivity } from '../audit/activity-log.service'

export const userRouter = Router()

const createUserSchema = z.object({
  name:     z.string().min(2),
  email:    z.string().email(),
  password: z.string().min(8),
  role:     z.enum(ROLES),
  phone:    z.string().optional(),
})

const updateUserSchema = z.object({
  name:  z.string().min(2).optional(),
  email: z.string().email().optional(),
  role:  z.enum(ROLES).optional(),
  phone: z.string().optional(),
})

userRouter.get('/',
  authenticate,
  permit('users', 'read'),
  asyncHandler(async (req, res) => {
    const { role, isAvailable, isActive } = req.query

    const query: userService.ListUsersQuery = {}

    if (typeof role === 'string') query.role = role as userService.ListUsersQuery['role']
    if (typeof isAvailable === 'string') query.isAvailable = isAvailable === 'true'
    if (typeof isActive === 'string') query.isActive = isActive === 'true'

    const result = await userService.listUsers(query)
    res.json(result)
  })
)

userRouter.post('/',
  authenticate,
  permit('users', 'create'),
  validate(createUserSchema),
  asyncHandler(async (req, res) => {
    const user = await userService.createUser(req.body)
    await logActivity({ userId: req.user._id, action: 'create', resource: 'users', resourceId: user!._id.toString(), details: { email: user!.email, role: user!.role } })
    res.status(201).json(user)
  })
)

userRouter.get('/:id',
  authenticate,
  permit('users', 'read'),
  asyncHandler(async (req, res) => {
    const user = await userService.getUserById(req.params.id)
    res.json(user)
  })
)

userRouter.patch('/:id',
  authenticate,
  permit('users', 'update'),
  validate(updateUserSchema),
  asyncHandler(async (req, res) => {
    const user = await userService.updateUser(req.params.id, req.body)
    await logActivity({ userId: req.user._id, action: 'update', resource: 'users', resourceId: req.params.id, details: req.body })
    res.json(user)
  })
)

userRouter.delete('/:id',
  authenticate,
  permit('users', 'delete'),
  asyncHandler(async (req, res) => {
    await userService.deleteUser(req.params.id)
    await logActivity({ userId: req.user._id, action: 'delete', resource: 'users', resourceId: req.params.id })
    res.status(204).send()
  })
)

userRouter.patch('/:id/availability',
  authenticate,
  permit('users', 'update'),
  asyncHandler(async (req, res) => {
    const user = await userService.toggleAvailability(req.params.id)
    await logActivity({ userId: req.user._id, action: 'update', resource: 'users', resourceId: req.params.id, details: { field: 'isAvailable', value: user!.isAvailable } })
    res.json(user)
  })
)
