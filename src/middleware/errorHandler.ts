import { Request, Response, NextFunction } from 'express'
import { Error as MongooseError } from 'mongoose'
import { AppError } from '../utils/AppError'
import { logger } from '../utils/logger'

export function errorHandler(err: Error & { code?: number }, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({ error: err.message })
  }

  // Malformed MongoDB ObjectId
  if (err instanceof MongooseError.CastError) {
    return res.status(400).json({ error: 'Invalid ID format' })
  }

  // Duplicate key (unique index violation — e.g. email already exists)
  if (err.code === 11000) {
    return res.status(409).json({ error: 'A record with that value already exists' })
  }

  // Mongoose schema validation errors
  if (err instanceof MongooseError.ValidationError) {
    const fields = Object.entries(err.errors).reduce((acc, [key, val]) => {
      acc[key] = val.message
      return acc
    }, {} as Record<string, string>)
    return res.status(400).json({ error: 'Validation failed', fields })
  }

  logger.error('Unhandled error', { error: err.message, stack: err.stack })
  res.status(500).json({ error: 'Internal server error' })
}
