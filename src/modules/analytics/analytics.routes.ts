import { Router } from 'express'
import { asyncHandler } from '../../utils/asyncHandler'
import { authenticate } from '../../middleware/authenticate'
import { permit } from '../../middleware/authorize'
import * as analyticsService from './analytics.service'

export const analyticsRouter = Router()

function dateRange(req: import('express').Request) {
  const { from, to } = req.query
  const range: analyticsService.DateRangeQuery = {}
  if (typeof from === 'string') range.from = from
  if (typeof to   === 'string') range.to   = to
  return range
}

analyticsRouter.get('/overview',
  authenticate,
  permit('analytics', 'read'),
  asyncHandler(async (req, res) => {
    const result = await analyticsService.getOverview(dateRange(req))
    res.json(result)
  })
)

analyticsRouter.get('/orders',
  authenticate,
  permit('analytics', 'read'),
  asyncHandler(async (req, res) => {
    const result = await analyticsService.getOrderStats(dateRange(req))
    res.json(result)
  })
)

analyticsRouter.get('/revenue',
  authenticate,
  permit('analytics', 'read'),
  asyncHandler(async (req, res) => {
    const result = await analyticsService.getRevenue(dateRange(req))
    res.json(result)
  })
)

analyticsRouter.get('/inventory',
  authenticate,
  permit('analytics', 'read'),
  asyncHandler(async (_req, res) => {
    const result = await analyticsService.getInventoryStatus()
    res.json(result)
  })
)

analyticsRouter.get('/tasks',
  authenticate,
  permit('analytics', 'read'),
  asyncHandler(async (req, res) => {
    const result = await analyticsService.getTaskStats(dateRange(req))
    res.json(result)
  })
)

analyticsRouter.get('/machines',
  authenticate,
  permit('analytics', 'read'),
  asyncHandler(async (_req, res) => {
    const result = await analyticsService.getMachineUtilization()
    res.json(result)
  })
)

analyticsRouter.get('/attendance',
  authenticate,
  permit('analytics', 'read'),
  asyncHandler(async (req, res) => {
    const result = await analyticsService.getAttendanceStats(dateRange(req))
    res.json(result)
  })
)

analyticsRouter.get('/customers',
  authenticate,
  permit('analytics', 'read'),
  asyncHandler(async (req, res) => {
    const result = await analyticsService.getCustomerStats(dateRange(req))
    res.json(result)
  })
)

analyticsRouter.get('/discounts',
  authenticate,
  permit('analytics', 'read'),
  asyncHandler(async (req, res) => {
    const result = await analyticsService.getDiscountStats(dateRange(req))
    res.json(result)
  })
)

analyticsRouter.get('/loyalty',
  authenticate,
  permit('analytics', 'read'),
  asyncHandler(async (req, res) => {
    const result = await analyticsService.getLoyaltyStats(dateRange(req))
    res.json(result)
  })
)
