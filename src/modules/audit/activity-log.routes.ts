import { Router } from 'express'
import { asyncHandler } from '../../utils/asyncHandler'
import { authenticate } from '../../middleware/authenticate'
import { permit } from '../../middleware/authorize'
import { parsePagination } from '../../utils/pagination'
import * as activityService from './activity-log.service'

export const activityLogRouter = Router()

activityLogRouter.get('/',
  authenticate,
  permit('activity_logs', 'read'),
  asyncHandler(async (req, res) => {
    const { userId, resource, resourceId, action, from, to } = req.query
    const result = await activityService.listActivityLogs({
      userId:     typeof userId     === 'string' ? userId     : undefined,
      resource:   typeof resource   === 'string' ? resource   : undefined,
      resourceId: typeof resourceId === 'string' ? resourceId : undefined,
      action:     typeof action     === 'string' ? action     : undefined,
      from:       typeof from       === 'string' ? from       : undefined,
      to:         typeof to         === 'string' ? to         : undefined,
      pagination: parsePagination(req.query),
    })
    res.json(result)
  })
)
