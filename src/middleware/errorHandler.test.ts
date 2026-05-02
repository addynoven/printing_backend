import { describe, it, expect, vi } from 'vitest'
import { Request, Response } from 'express'
import { Error as MongooseError } from 'mongoose'
import { errorHandler } from './errorHandler'
import { BadRequestError } from '../utils/AppError'

describe('errorHandler', () => {
  function mockRes(): Response {
    return {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    } as unknown as Response
  }

  const mockReq = {} as Request
  const mockNext = vi.fn()

  it('AppError → status code from error', () => {
    const res = mockRes()
    errorHandler(new BadRequestError('bad'), mockReq, res, mockNext)
    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith({ error: 'bad' })
  })

  it('Mongoose CastError → 400', () => {
    const res = mockRes()
    const castErr = new MongooseError.CastError('ObjectId', 'bad', 'id')
    errorHandler(castErr as unknown as Error, mockReq, res, mockNext)
    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid ID format' })
  })

  it('Mongoose ValidationError → 400 with field details', () => {
    const res = mockRes()
    const validationErr = new MongooseError.ValidationError()
    validationErr.errors = {
      name: new MongooseError.ValidatorError({ message: 'Name is required', path: 'name' }),
    } as unknown as MongooseError.ValidationError['errors']
    errorHandler(validationErr as unknown as Error, mockReq, res, mockNext)
    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith({ error: 'Validation failed', fields: { name: 'Name is required' } })
  })

  it('Duplicate key (11000) → 409', () => {
    const res = mockRes()
    const dupErr = Object.assign(new Error('duplicate'), { code: 11000 })
    errorHandler(dupErr, mockReq, res, mockNext)
    expect(res.status).toHaveBeenCalledWith(409)
  })

  it('Unknown error → 500', () => {
    const res = mockRes()
    errorHandler(new Error('boom'), mockReq, res, mockNext)
    expect(res.status).toHaveBeenCalledWith(500)
    expect(res.json).toHaveBeenCalledWith({ error: 'Internal server error' })
  })
})
