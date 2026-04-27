import jwt from 'jsonwebtoken'
import { env } from '../../config/env'
import { User } from './auth.model'
import { UnauthorizedError, ConflictError } from '../../utils/AppError'

export async function login(email: string, password: string) {
  const user = await User.findOne({ email, isActive: true }).select('+password')
  if (!user) throw new UnauthorizedError('Invalid email or password')

  const valid = await user.comparePassword(password)
  if (!valid) throw new UnauthorizedError('Invalid email or password')

  const token = jwt.sign(
    { _id: user._id, role: user.role, email: user.email },
    env.JWT_SECRET,
    { expiresIn: env.JWT_EXPIRES_IN }
  )

  return {
    token,
    user: { _id: user._id, name: user.name, email: user.email, role: user.role },
  }
}

export async function createUser(data: {
  name: string; email: string; password: string; role: string; phone?: string
}) {
  const exists = await User.findOne({ email: data.email })
  if (exists) throw new ConflictError('Email already in use')

  const user = await User.create(data)
  return { _id: user._id, name: user.name, email: user.email, role: user.role }
}

export async function getMe(userId: string) {
  const user = await User.findById(userId).lean()
  if (!user) throw new UnauthorizedError('User not found')
  return user
}
