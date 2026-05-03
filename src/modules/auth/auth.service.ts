import crypto from 'node:crypto'
import jwt from 'jsonwebtoken'
import { env } from '../../config/env'
import { User } from './auth.model'
import { logActivity } from '../audit/activity-log.service'
import { UnauthorizedError, ConflictError, ValidationError } from '../../utils/AppError'

const PASSWORD_RESET_TTL_MS = 15 * 60 * 1000

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex')
}

export async function login(email: string, password: string, ip?: string) {
  const user = await User.findOne({ email, isActive: true }).select('+password')
  if (!user) {
    await logActivity({ action: 'login', resource: 'auth', details: { success: false, email }, ip })
    throw new UnauthorizedError('Invalid email or password')
  }

  const valid = await user.comparePassword(password)
  if (!valid) {
    await logActivity({ userId: user._id.toString(), action: 'login', resource: 'auth', details: { success: false, email }, ip })
    throw new UnauthorizedError('Invalid email or password')
  }

  const token = jwt.sign(
    { _id: user._id, role: user.role, email: user.email },
    env.JWT_SECRET,
    { expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'] }
  )

  await logActivity({ userId: user._id.toString(), action: 'login', resource: 'auth', details: { success: true, email }, ip })
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

export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
  ip?: string,
) {
  if (newPassword.length < 8) throw new ValidationError('New password must be at least 8 characters')
  if (currentPassword === newPassword) throw new ValidationError('New password must be different from current')

  const user = await User.findById(userId).select('+password')
  if (!user) throw new UnauthorizedError('User not found')

  const ok = await user.comparePassword(currentPassword)
  if (!ok) {
    await logActivity({ userId, action: 'update', resource: 'auth', details: { event: 'password_change', success: false }, ip })
    throw new UnauthorizedError('Current password is incorrect')
  }

  user.password = newPassword
  user.passwordResetTokenHash = undefined
  user.passwordResetExpiresAt = undefined
  await user.save()

  await logActivity({ userId, action: 'update', resource: 'auth', details: { event: 'password_change', success: true }, ip })
  return { message: 'Password changed successfully' }
}

export async function requestPasswordReset(email: string, ip?: string) {
  const user = await User.findOne({ email: email.toLowerCase(), isActive: true })

  // Always succeed at the route level — never leak whether the email exists.
  // We still mint a token + log on a hit so the caller can wire delivery later.
  if (!user) {
    await logActivity({ action: 'update', resource: 'auth', details: { event: 'password_reset_request', success: false, email }, ip })
    return { message: 'If that email exists, a reset link has been sent.' }
  }

  const token = crypto.randomBytes(32).toString('hex')
  user.passwordResetTokenHash = hashToken(token)
  user.passwordResetExpiresAt = new Date(Date.now() + PASSWORD_RESET_TTL_MS)
  await user.save()

  await logActivity({ userId: user._id.toString(), action: 'update', resource: 'auth', details: { event: 'password_reset_request', success: true, email }, ip })

  // The token would normally be emailed. Returning it in the response only
  // when explicitly opted in via env (useful for tests and dev environments).
  const includeTokenInResponse = process.env.NODE_ENV !== 'production'
  return {
    message: 'If that email exists, a reset link has been sent.',
    ...(includeTokenInResponse ? { resetToken: token } : {}),
  }
}

export async function resetPassword(token: string, newPassword: string, ip?: string) {
  if (newPassword.length < 8) throw new ValidationError('New password must be at least 8 characters')

  const tokenHash = hashToken(token)
  const user = await User.findOne({
    passwordResetTokenHash: tokenHash,
    passwordResetExpiresAt: { $gt: new Date() },
    isActive: true,
  }).select('+password +passwordResetTokenHash +passwordResetExpiresAt')

  if (!user) {
    await logActivity({ action: 'update', resource: 'auth', details: { event: 'password_reset', success: false }, ip })
    throw new UnauthorizedError('Invalid or expired reset token')
  }

  user.password = newPassword
  user.passwordResetTokenHash = undefined
  user.passwordResetExpiresAt = undefined
  await user.save()

  await logActivity({ userId: user._id.toString(), action: 'update', resource: 'auth', details: { event: 'password_reset', success: true }, ip })
  return { message: 'Password reset successfully' }
}
