import { Machine, MachineStatus, MachineType } from './machine.model'
import { NotFoundError } from '../../utils/AppError'

export interface ListMachinesQuery {
  type?:   MachineType
  status?: MachineStatus
}

export interface CreateMachineInput {
  name:       string
  type:       MachineType
  department: string
  status?:    MachineStatus
  notes?:     string
}

export interface UpdateMachineInput {
  name?:       string
  department?: string
  notes?:      string
}

export async function listMachines(query: ListMachinesQuery) {
  const filter: Record<string, unknown> = {}
  if (query.type)   filter.type   = query.type
  if (query.status) filter.status = query.status

  const machines = await Machine.find(filter).lean()
  return { machines, total: machines.length }
}

export async function createMachine(data: CreateMachineInput) {
  const machine = await Machine.create(data)
  return machine.toObject()
}

export async function getMachineById(id: string) {
  const machine = await Machine.findById(id).lean()
  if (!machine) throw new NotFoundError('Machine not found')
  return machine
}

export async function updateMachine(id: string, data: UpdateMachineInput) {
  const machine = await Machine.findByIdAndUpdate(id, data, { new: true, runValidators: true }).lean()
  if (!machine) throw new NotFoundError('Machine not found')
  return machine
}

export async function setMachineStatus(id: string, status: MachineStatus) {
  const machine = await Machine.findByIdAndUpdate(id, { status }, { new: true, runValidators: true }).lean()
  if (!machine) throw new NotFoundError('Machine not found')
  return machine
}
