import { Role } from '../../src/config/permissions'

export interface UserData {
  _id?: string
  name: string
  email: string
  password: string
  role: Role
  isAvailable: boolean
  activeTaskCount: number
  isActive: boolean
}

export interface OrderData {
  _id?: string
  jobType: string
  status: string
  rawCost: number
  taxableValue: number
  billSplitPct: number
  priority: string
  customer: { name: string; phone: string; email: string }
}

export interface TaskData {
  _id?: string
  orderId: string
  type: string
  status: string
  assignedTo: string | null
  priority: string
}

export function makeUser(overrides: Partial<UserData> = {}): UserData {
  return {
    name:           'Test User',
    email:          'test@poms.com',
    password:       'password123',
    role:           'admin',
    isAvailable:    true,
    activeTaskCount: 0,
    isActive:       true,
    ...overrides,
  }
}

export function makeOrder(overrides: Partial<OrderData> = {}): OrderData {
  return {
    jobType:      'flex_printing',
    status:       'draft',
    rawCost:      500,
    taxableValue: 300,
    billSplitPct: 40,
    priority:     'normal',
    customer: {
      name:  'Test Customer',
      phone: '9999999999',
      email: 'customer@test.com',
    },
    ...overrides,
  }
}

export function makeTask(overrides: Partial<TaskData> = {}): TaskData {
  return {
    orderId:    'ord_123',
    type:       'flex_printing',
    status:     'assigned',
    assignedTo: 'usr_123',
    priority:   'normal',
    ...overrides,
  }
}

export interface MachineData {
  _id?:       string
  name:       string
  type:       string
  department: string
  status:     string
  notes?:     string
}

export function makeMachine(overrides: Partial<MachineData> = {}): MachineData {
  return {
    name:       'Test Machine',
    type:       'flex_printer',
    department: 'Printing',
    status:     'active',
    ...overrides,
  }
}
