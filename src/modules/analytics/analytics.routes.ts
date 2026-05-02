import { Router } from 'express'
import { asyncHandler } from '../../utils/asyncHandler'
import { authenticate } from '../../middleware/authenticate'
import { permit } from '../../middleware/authorize'
import * as analyticsService from './analytics.service'

export const analyticsRouter = Router()

analyticsRouter.get('/overview',
  authenticate,
  permit('analytics', 'read'),
  asyncHandler(async (_req, res) => {
    const data = await analyticsService.getOverview()
    res.json(data)
  })
)

analyticsRouter.get('/orders',
  authenticate,
  permit('analytics', 'read'),
  asyncHandler(async (_req, res) => {
    const data = await analyticsService.getOrderStats()
    res.json(data)
  })
)

analyticsRouter.get('/revenue',
  authenticate,
  permit('analytics', 'read'),
  asyncHandler(async (_req, res) => {
    const data = await analyticsService.getRevenueStats()
    res.json(data)
  })
)

analyticsRouter.get('/tasks',
  authenticate,
  permit('analytics', 'read'),
  asyncHandler(async (_req, res) => {
    const data = await analyticsService.getTaskStats()
    res.json(data)
  })
)
