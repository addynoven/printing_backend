import { Router } from 'express'
import { asyncHandler } from '../../utils/asyncHandler'
import { authenticate } from '../../middleware/authenticate'
import { permit } from '../../middleware/authorize'
import * as activityService from './activity-log.service'

export const activityLogRouter = Router()

activityLogRouter.get('/',
  authenticate,
  permit('activity_logs', 'read'),
  asyncHandler(async (req, res) => {
    const { userId, resource, resourceId, limit } = req.query
    const result = await activityService.listActivityLogs({
      userId: typeof userId === 'string' ? userId : undefined,
      resource: typeof resource === 'string' ? resource : undefined,
      resourceId: typeof resourceId === 'string' ? resourceId : undefined,
      limit: typeof limit === 'string' ? parseInt(limit, 10) : undefined,
    })
    res.json(result)
  })
)
