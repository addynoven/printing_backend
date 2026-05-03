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

const passwordResetRateLimit = makeRateLimit({
  max: 5,
  message: 'Too many password reset attempts. Please try again later.',
})

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword:     z.string().min(8),
})

const forgotPasswordSchema = z.object({
  email: z.string().email(),
})

const resetPasswordSchema = z.object({
  token:       z.string().min(1),
  newPassword: z.string().min(8),
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

authRouter.patch('/password',
  authenticate,
  validate(changePasswordSchema),
  asyncHandler(async (req, res) => {
    const result = await authService.changePassword(
      req.user._id,
      req.body.currentPassword,
      req.body.newPassword,
      req.ip,
    )
    res.json(result)
  })
)

authRouter.post('/forgot-password',
  passwordResetRateLimit,
  validate(forgotPasswordSchema),
  asyncHandler(async (req, res) => {
    const result = await authService.requestPasswordReset(req.body.email, req.ip)
    res.json(result)
  })
)

authRouter.post('/reset-password',
  passwordResetRateLimit,
  validate(resetPasswordSchema),
  asyncHandler(async (req, res) => {
    const result = await authService.resetPassword(req.body.token, req.body.newPassword, req.ip)
    res.json(result)
  })
)
