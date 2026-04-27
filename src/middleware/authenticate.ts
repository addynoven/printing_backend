import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { env } from '../config/env'
import { UnauthorizedError } from '../utils/AppError'
import { Role } from '../config/permissions'

export interface JwtPayload {
  _id: string
  role: Role
  email: string
}

declare global {
  namespace Express {
    interface Request {
      user: JwtPayload
      scopeToOwn: boolean
    }
  }
}

export function authenticate(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) return next(new UnauthorizedError('Missing token'))

  const token = header.split(' ')[1]
  try {
    req.user = jwt.verify(token, env.JWT_SECRET) as JwtPayload
    req.scopeToOwn = false
    next()
  } catch {
    next(new UnauthorizedError('Invalid or expired token'))
  }
}
