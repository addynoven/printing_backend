import { ActivityLog } from './activity-log.model'
import { logger } from '../../utils/logger'

export interface LogActivityInput {
  userId?:     string
  action:      typeof import('./activity-log.model').ACTION_TYPES[number]
  resource:    string
  resourceId?: string
  details?:    Record<string, unknown>
  ip?:         string
}

export async function logActivity(data: LogActivityInput) {
  try {
    return await ActivityLog.create(data)
  } catch (err) {
    logger.warn('Activity log failed', { error: (err as Error).message, action: data.action, resource: data.resource })
  }
}

export async function listActivityLogs(query: {
  userId?: string
  resource?: string
  resourceId?: string
  limit?: number
}) {
  const filter: Record<string, unknown> = {}
  if (query.userId) filter.userId = query.userId
  if (query.resource) filter.resource = query.resource
  if (query.resourceId) filter.resourceId = query.resourceId

  const logs = await ActivityLog.find(filter)
    .sort({ createdAt: -1 })
    .limit(query.limit ?? 50)
    .lean()

  return { logs, total: logs.length }
}
