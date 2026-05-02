import { Router } from 'express'
import { z } from 'zod'
import { makeRateLimit } from '../../middleware/rateLimit'
import { asyncHandler } from '../../utils/asyncHandler'
import { authenticate } from '../../middleware/authenticate'
import { validate } from '../../middleware/validate'
import * as authService from './auth.service'

export const authRouter = Router()

const loginSchema = z.object({
  email:    z.string().email(),
  password: z.string().min(1),
})

const loginRateLimit = makeRateLimit({
  max: 10,
  message: 'Too many login attempts. Please try again later.',
})

authRouter.post('/login',
  loginRateLimit,
  validate(loginSchema),
  asyncHandler(async (req, res) => {
    const result = await authService.login(req.body.email, req.body.password, req.ip)
    res.json(result)
  })
)

authRouter.get('/me',
  authenticate,
  asyncHandler(async (req, res) => {
    const user = await authService.getMe(req.user._id)
    res.json(user)
  })
)
