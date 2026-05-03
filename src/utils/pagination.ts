export interface PaginationParams {
  page:  number
  limit: number
  skip:  number
}

const DEFAULT_LIMIT = 20
const MAX_LIMIT     = 100

export function parsePagination(query: { page?: unknown; limit?: unknown }): PaginationParams {
  const page  = Math.max(1, parseInt(String(query.page  ?? '1'),  10) || 1)
  const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(String(query.limit ?? DEFAULT_LIMIT), 10) || DEFAULT_LIMIT))
  return { page, limit, skip: (page - 1) * limit }
}

export interface Paginated<T> {
  data:  T[]
  total: number
  page:  number
  limit: number
  pages: number
}

export function paginated<T>(data: T[], total: number, p: PaginationParams): Paginated<T> {
  return {
    data,
    total,
    page:  p.page,
    limit: p.limit,
    pages: Math.max(1, Math.ceil(total / p.limit)),
  }
}
