import { vi, describe, it, expect, beforeEach } from 'vitest'

vi.mock('../auth/auth.model', () => {
  const mockUser = {
    findOne:           vi.fn(),
    findById:          vi.fn(),
    find:              vi.fn(),
    create:            vi.fn(),
    findByIdAndUpdate: vi.fn(),
  }
  return { User: mockUser }
})

import * as userService from './user.service'
import { User } from '../auth/auth.model'
import { makeUser } from '../../../tests/helpers/mock-factory'
import { NotFoundError, ConflictError } from '../../utils/AppError'

const MockUser = vi.mocked(User as unknown as {
  findOne:           ReturnType<typeof vi.fn>
  findById:          ReturnType<typeof vi.fn>
  find:              ReturnType<typeof vi.fn>
  create:            ReturnType<typeof vi.fn>
  findByIdAndUpdate: ReturnType<typeof vi.fn>
})

function chain(value: unknown) {
  return { select: vi.fn().mockReturnThis(), lean: vi.fn().mockResolvedValue(value) }
}

describe('User Service — Unit Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('listUsers', () => {
    it('returns all active users when no filters applied', async () => {
      const users = [makeUser({ email: 'a@test.com' }), makeUser({ email: 'b@test.com' })]
      MockUser.find.mockReturnValue(chain(users))

      const result = await userService.listUsers({})

      expect(MockUser.find).toHaveBeenCalledWith(expect.objectContaining({ isActive: true }))
      expect(result.total).toBe(2)
    })

    it('filters by role', async () => {
      MockUser.find.mockReturnValue(chain([]))
      await userService.listUsers({ role: 'designer' })
      expect(MockUser.find).toHaveBeenCalledWith(expect.objectContaining({ role: 'designer' }))
    })

    it('filters by isAvailable', async () => {
      MockUser.find.mockReturnValue(chain([]))
      await userService.listUsers({ isAvailable: true })
      expect(MockUser.find).toHaveBeenCalledWith(expect.objectContaining({ isAvailable: true }))
    })

    it('can query inactive users when isActive=false', async () => {
      MockUser.find.mockReturnValue(chain([]))
      await userService.listUsers({ isActive: false })
      expect(MockUser.find).toHaveBeenCalledWith(expect.objectContaining({ isActive: false }))
    })
  })

  describe('createUser', () => {
    it('creates user and returns full user without password', async () => {
      const input = { name: 'Alice', email: 'alice@test.com', password: 'securepass', role: 'designer' as const }
      const created = { _id: 'uid_1' }
      const full = { _id: 'uid_1', name: 'Alice', email: 'alice@test.com', role: 'designer', isAvailable: true }

      MockUser.findOne.mockResolvedValue(null)
      MockUser.create.mockResolvedValue(created)
      MockUser.findById.mockReturnValue(chain(full))

      const result = await userService.createUser(input)

      expect(result).toMatchObject({ name: 'Alice', role: 'designer', isAvailable: true })
      expect(result).not.toHaveProperty('password')
    })

    it('throws ConflictError if email already exists', async () => {
      MockUser.findOne.mockResolvedValue(makeUser({ email: 'exists@test.com' }))

      await expect(
        userService.createUser({ name: 'Bob', email: 'exists@test.com', password: 'pass1234', role: 'admin' })
      ).rejects.toBeInstanceOf(ConflictError)
    })
  })

  describe('getUserById', () => {
    it('returns user when found', async () => {
      MockUser.findById.mockReturnValue(chain(makeUser({ email: 'found@test.com' })))
      const result = await userService.getUserById('user_001')
      expect(result).toMatchObject({ email: 'found@test.com' })
    })

    it('throws NotFoundError when not found', async () => {
      MockUser.findById.mockReturnValue(chain(null))
      await expect(userService.getUserById('bad_id')).rejects.toBeInstanceOf(NotFoundError)
    })
  })

  describe('updateUser', () => {
    it('updates fields and returns updated user', async () => {
      MockUser.findByIdAndUpdate.mockReturnValue(chain(makeUser({ name: 'Updated' })))
      const result = await userService.updateUser('user_001', { name: 'Updated' })

      expect(MockUser.findByIdAndUpdate).toHaveBeenCalledWith(
        'user_001',
        expect.objectContaining({ name: 'Updated' }),
        expect.objectContaining({ new: true, runValidators: true })
      )
      expect(result).toMatchObject({ name: 'Updated' })
    })

    it('throws NotFoundError when user does not exist', async () => {
      MockUser.findByIdAndUpdate.mockReturnValue(chain(null))
      await expect(userService.updateUser('bad_id', { name: 'X' })).rejects.toBeInstanceOf(NotFoundError)
    })
  })

  describe('deleteUser', () => {
    it('soft deletes by setting isActive=false', async () => {
      MockUser.findByIdAndUpdate.mockReturnValue(chain(makeUser({ isActive: false })))
      await userService.deleteUser('user_001')

      expect(MockUser.findByIdAndUpdate).toHaveBeenCalledWith(
        'user_001',
        { isActive: false },
        expect.objectContaining({ new: true })
      )
    })

    it('throws NotFoundError when user does not exist', async () => {
      MockUser.findByIdAndUpdate.mockReturnValue(chain(null))
      await expect(userService.deleteUser('bad_id')).rejects.toBeInstanceOf(NotFoundError)
    })
  })

  describe('toggleAvailability', () => {
    it('uses atomic pipeline update — single DB call', async () => {
      MockUser.findByIdAndUpdate.mockReturnValue(chain(makeUser({ isAvailable: false })))

      const result = await userService.toggleAvailability('user_001')

      expect(MockUser.findByIdAndUpdate).toHaveBeenCalledTimes(1)
      expect(MockUser.findByIdAndUpdate).toHaveBeenCalledWith(
        'user_001',
        [{ $set: { isAvailable: { $not: '$isAvailable' } } }],
        expect.objectContaining({ new: true })
      )
      expect(result).not.toBeNull()
    })

    it('throws NotFoundError when user does not exist', async () => {
      MockUser.findByIdAndUpdate.mockReturnValue(chain(null))
      await expect(userService.toggleAvailability('bad_id')).rejects.toBeInstanceOf(NotFoundError)
    })
  })
})
