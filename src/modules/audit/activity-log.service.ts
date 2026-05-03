import { ActivityLog } from './activity-log.model'
import { logger } from '../../utils/logger'
import { PaginationParams } from '../../utils/pagination'

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

export interface ListActivityLogsQuery {
  userId?:     string
  resource?:   string
  resourceId?: string
  action?:     string
  from?:       string
  to?:         string
  pagination?: PaginationParams
}

export async function listActivityLogs(query: ListActivityLogsQuery) {
  const filter: Record<string, unknown> = {}
  if (query.userId)     filter.userId     = query.userId
  if (query.resource)   filter.resource   = query.resource
  if (query.resourceId) filter.resourceId = query.resourceId
  if (query.action)     filter.action     = query.action

  if (query.from || query.to) {
    const dateFilter: Record<string, Date> = {}
    if (query.from) dateFilter.$gte = new Date(query.from)
    if (query.to)   dateFilter.$lte = new Date(query.to)
    filter.createdAt = dateFilter
  }

  const p = query.pagination
  const cursor = p
    ? ActivityLog.find(filter).sort({ createdAt: -1 }).skip(p.skip).limit(p.limit)
    : ActivityLog.find(filter).sort({ createdAt: -1 }).limit(50)

  const logs  = await cursor.lean()
  const total = p ? await ActivityLog.countDocuments(filter) : logs.length

  return {
    logs,
    total,
    page:  p?.page  ?? 1,
    limit: p?.limit ?? logs.length,
    pages: p ? Math.max(1, Math.ceil(total / p.limit)) : 1,
  }
}
