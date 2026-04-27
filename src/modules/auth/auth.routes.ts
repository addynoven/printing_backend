import { Router } from 'express'
import { z } from 'zod'
import { asyncHandler } from '../../utils/asyncHandler'
import { authenticate } from '../../middleware/authenticate'
import { validate } from '../../middleware/validate'
import * as authService from './auth.service'

export const authRouter = Router()

const loginSchema = z.object({
  email:    z.string().email(),
  password: z.string().min(1),
})

authRouter.post('/login',
  validate(loginSchema),
  asyncHandler(async (req, res) => {
    const result = await authService.login(req.body.email, req.body.password)
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
