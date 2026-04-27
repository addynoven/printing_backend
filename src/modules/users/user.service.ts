import { User } from '../auth/auth.model'
import { Role } from '../../config/permissions'
import { NotFoundError, ConflictError } from '../../utils/AppError'

export interface ListUsersQuery {
  role?: Role
  isAvailable?: boolean
  isActive?: boolean
}

export interface CreateUserInput {
  name: string
  email: string
  password: string
  role: Role
  phone?: string
}

export interface UpdateUserInput {
  name?: string
  email?: string
  role?: Role
  phone?: string
}

export async function listUsers(query: ListUsersQuery) {
  const filter: Record<string, unknown> = {
    isActive: query.isActive !== undefined ? query.isActive : true,
  }

  if (query.role !== undefined) filter.role = query.role
  if (query.isAvailable !== undefined) filter.isAvailable = query.isAvailable

  const users = await User.find(filter).select('-password').lean()
  return { users, total: users.length }
}

export async function createUser(data: CreateUserInput) {
  const exists = await User.findOne({ email: data.email })
  if (exists) throw new ConflictError('Email already in use')

  const user = await User.create(data)
  return User.findById(user._id).select('-password').lean()
}

export async function getUserById(id: string) {
  const user = await User.findById(id).select('-password').lean()
  if (!user) throw new NotFoundError('User not found')
  return user
}

export async function updateUser(id: string, data: UpdateUserInput) {
  const user = await User.findByIdAndUpdate(id, data, { new: true, runValidators: true })
    .select('-password')
    .lean()
  if (!user) throw new NotFoundError('User not found')
  return user
}

export async function deleteUser(id: string) {
  const user = await User.findByIdAndUpdate(id, { isActive: false }, { new: true })
    .select('-password')
    .lean()
  if (!user) throw new NotFoundError('User not found')
  return user
}

export async function toggleAvailability(id: string) {
  // Atomic toggle — single round trip, no race condition
  const updated = await User.findByIdAndUpdate(
    id,
    [{ $set: { isAvailable: { $not: '$isAvailable' } } }],
    { new: true }
  )
    .select('-password')
    .lean()

  if (!updated) throw new NotFoundError('User not found')
  return updated
}
