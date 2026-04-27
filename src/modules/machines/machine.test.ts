import { vi, describe, it, expect, beforeEach } from 'vitest'

vi.mock('./machine.model', () => {
  const mockMachine = {
    find:              vi.fn(),
    create:            vi.fn(),
    findByIdAndUpdate: vi.fn(),
  }
  return { Machine: mockMachine }
})

import * as machineService from './machine.service'
import { Machine } from './machine.model'
import { makeMachine } from '../../../tests/helpers/mock-factory'
import { NotFoundError } from '../../utils/AppError'

const MockMachine = vi.mocked(Machine as unknown as {
  find:              ReturnType<typeof vi.fn>
  create:            ReturnType<typeof vi.fn>
  findByIdAndUpdate: ReturnType<typeof vi.fn>
})

// chain helper for .lean() calls (no .select needed — machine service doesn't use it)
function chain(value: unknown) {
  return { lean: vi.fn().mockResolvedValue(value) }
}

describe('Machine Service — Unit Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ──────────────────────────────────────────────
  // listMachines
  // ──────────────────────────────────────────────
  describe('listMachines', () => {
    it('returns all machines when no filter applied', async () => {
      const machines = [makeMachine(), makeMachine({ name: 'Machine B', type: 'laser_cutter' })]
      MockMachine.find.mockReturnValue(chain(machines))

      const result = await machineService.listMachines({})

      expect(MockMachine.find).toHaveBeenCalledWith({})
      expect(result.total).toBe(2)
      expect(result.machines).toHaveLength(2)
    })

    it('filters by type', async () => {
      MockMachine.find.mockReturnValue(chain([makeMachine({ type: 'laser_cutter' })]))

      await machineService.listMachines({ type: 'laser_cutter' })

      expect(MockMachine.find).toHaveBeenCalledWith(expect.objectContaining({ type: 'laser_cutter' }))
    })

    it('filters by status', async () => {
      MockMachine.find.mockReturnValue(chain([makeMachine({ status: 'maintenance' })]))

      await machineService.listMachines({ status: 'maintenance' })

      expect(MockMachine.find).toHaveBeenCalledWith(expect.objectContaining({ status: 'maintenance' }))
    })
  })

  // ──────────────────────────────────────────────
  // createMachine
  // ──────────────────────────────────────────────
  describe('createMachine', () => {
    it('creates machine and returns plain object', async () => {
      const input = makeMachine({ name: 'Flex One', type: 'flex_printer', department: 'Flex Dept' })
      const doc   = { ...input, _id: 'machine_001', toObject: () => ({ ...input, _id: 'machine_001' }) }
      MockMachine.create.mockResolvedValue(doc)

      const result = await machineService.createMachine({
        name:       'Flex One',
        type:       'flex_printer',
        department: 'Flex Dept',
      })

      expect(MockMachine.create).toHaveBeenCalledWith(expect.objectContaining({ name: 'Flex One', type: 'flex_printer' }))
      expect(result).toMatchObject({ name: 'Flex One', type: 'flex_printer' })
    })
  })

  // ──────────────────────────────────────────────
  // updateMachine
  // ──────────────────────────────────────────────
  describe('updateMachine', () => {
    it('updates fields and returns updated machine', async () => {
      const updated = makeMachine({ name: 'Updated Name' })
      MockMachine.findByIdAndUpdate.mockReturnValue(chain(updated))

      const result = await machineService.updateMachine('machine_001', { name: 'Updated Name' })

      expect(MockMachine.findByIdAndUpdate).toHaveBeenCalledWith(
        'machine_001',
        { name: 'Updated Name' },
        expect.objectContaining({ new: true, runValidators: true })
      )
      expect(result).toMatchObject({ name: 'Updated Name' })
    })

    it('throws NotFoundError when machine does not exist', async () => {
      MockMachine.findByIdAndUpdate.mockReturnValue(chain(null))

      await expect(
        machineService.updateMachine('bad_id', { name: 'Ghost' })
      ).rejects.toBeInstanceOf(NotFoundError)
    })
  })

  // ──────────────────────────────────────────────
  // setMachineStatus
  // ──────────────────────────────────────────────
  describe('setMachineStatus', () => {
    it('sets status and returns updated machine', async () => {
      const updated = makeMachine({ status: 'maintenance' })
      MockMachine.findByIdAndUpdate.mockReturnValue(chain(updated))

      const result = await machineService.setMachineStatus('machine_001', 'maintenance')

      expect(MockMachine.findByIdAndUpdate).toHaveBeenCalledWith(
        'machine_001',
        { status: 'maintenance' },
        expect.objectContaining({ new: true, runValidators: true })
      )
      expect(result).toMatchObject({ status: 'maintenance' })
    })

    it('throws NotFoundError when machine does not exist', async () => {
      MockMachine.findByIdAndUpdate.mockReturnValue(chain(null))

      await expect(
        machineService.setMachineStatus('bad_id', 'inactive')
      ).rejects.toBeInstanceOf(NotFoundError)
    })
  })
})
