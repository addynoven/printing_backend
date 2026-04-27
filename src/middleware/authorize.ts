import { Request, Response, NextFunction } from 'express'
import { PERMISSIONS, Action, Resource } from '../config/permissions'
import { ForbiddenError } from '../utils/AppError'

export function permit(resource: Resource, action: Action) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const role = req.user?.role
    if (!role) return next(new ForbiddenError())

    const perms = PERMISSIONS[role]?.[resource]
    if (!perms?.[action]) return next(new ForbiddenError())

    req.scopeToOwn = perms.own === true
    next()
  }
}
