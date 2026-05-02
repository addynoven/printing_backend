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
  items: Array<{ description: string; quantity: number; unit: string; unitPrice: number }>
  createdBy?: string
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
    items: [{ description: 'Banner print', quantity: 2, unit: 'sqft', unitPrice: 250 }],
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

export interface MaterialData {
  _id?:        string
  name:        string
  category:    string
  unit:        string
  stock:       number
  threshold:   number
  costPerUnit: number
  supplier?:   { name?: string; phone?: string; email?: string }
  isActive:    boolean
}

export function makeMaterial(overrides: Partial<MaterialData> = {}): MaterialData {
  return {
    name:        'Test Flex Material',
    category:    'flex',
    unit:        'sqft',
    stock:       100,
    threshold:   10,
    costPerUnit: 5,
    isActive:    true,
    ...overrides,
  }
}

export interface PaymentData {
  _id?:         string
  orderId:      string
  billId?:      string | null
  type:         'advance' | 'final' | 'partial'
  amount:       number
  method:       'cash' | 'upi' | 'card'
  status:       'pending' | 'completed' | 'refunded'
  referenceId?: string | null
  collectedBy:  string
  paidAt?:      Date | null
  notes?:       string | null
}

export function makePayment(overrides: Partial<PaymentData> = {}): PaymentData {
  return {
    _id:         'pay_default',
    orderId:     'ord_placeholder',
    billId:      null,
    type:        'advance',
    amount:      500,
    method:      'cash',
    status:      'completed',
    referenceId: null,
    collectedBy: 'usr_placeholder',
    paidAt:      null,
    notes:       null,
    ...overrides,
  }
}

export interface BarcodeData {
  _id?:      string
  orderId:   string
  type:      'initial' | 'final'
  code:      string
  qrDataUrl: string
}

export function makeBarcode(overrides: Partial<BarcodeData> = {}): BarcodeData {
  return {
    orderId:   'ord_placeholder',
    type:      'initial',
    code:      'ord_placeholder',
    qrDataUrl: 'data:image/png;base64,fake',
    ...overrides,
  }
}

export interface BillData {
  _id?:          string
  orderId:       string
  type:          'raw' | 'gst'
  seriesNumber:  string
  amount:        number
  isProtected:   boolean
  pdfUrl?:       string | null
  lineItems:     Array<{ description: string; qty: number; rate: number; amount: number }>
  gstin?:        string | null
  hsnCode?:      string | null
  taxableAmount?: number | null
  cgst?:         number | null
  sgst?:         number | null
  totalAmount?:  number | null
  createdBy:     string
}

export function makeBill(overrides: Partial<BillData> = {}): BillData {
  return {
    _id:          'bill_default',
    orderId:      'ord_123',
    type:         'raw',
    seriesNumber: 'RAW-2024-001',
    amount:       500,
    isProtected:  true,
    pdfUrl:       null,
    lineItems:    [{ description: 'Banner print', qty: 2, rate: 250, amount: 500 }],
    gstin:        null,
    hsnCode:      null,
    taxableAmount: null,
    cgst:         null,
    sgst:         null,
    totalAmount:  null,
    createdBy:    'usr_123',
    ...overrides,
  }
}

export interface NotificationData {
  _id?:          string
  userId:        string
  type:          'task_assigned' | 'task_delayed' | 'low_stock' | 'order_completed' | 'payment_received'
  title:         string
  message:       string
  resourceId?:   string | null
  resourceType?: 'order' | 'task' | 'material' | 'payment' | null
  read:          boolean
}

export function makeNotification(overrides: Partial<NotificationData> = {}): NotificationData {
  return {
    userId:       'user_default',
    type:         'task_assigned',
    title:        'Task Assigned',
    message:      'You have been assigned a new task.',
    resourceId:   null,
    resourceType: null,
    read:         false,
    ...overrides,
  }
}

export interface DiscountData {
  _id?:        string
  name:        string
  type:        'percentage' | 'fixed'
  value:       number
  scope:       'normal' | 'loyal' | 'all'
  minOrderValue?: number
  maxDiscount?:   number
  isActive:    boolean
  createdBy:   string
}

export function makeDiscount(overrides: Partial<DiscountData> = {}): DiscountData {
  return {
    name:      'Summer Sale',
    type:      'percentage',
    value:     10,
    scope:     'all',
    isActive:  true,
    createdBy: 'usr_admin',
    ...overrides,
  }
}

export interface CustomerData {
  _id?:        string
  name:        string
  phone:       string
  email?:      string
  visitCount:  number
  totalSpend:  number
  loyaltyTier: 'bronze' | 'silver' | 'gold' | 'platinum'
  isActive:    boolean
}

export function makeCustomer(overrides: Partial<CustomerData> = {}): CustomerData {
  return {
    name:        'Test Customer',
    phone:       '9876543210',
    email:       'customer@test.com',
    visitCount:  1,
    totalSpend:  500,
    loyaltyTier: 'bronze',
    isActive:    true,
    ...overrides,
  }
}

export interface CouponData {
  _id?:         string
  code:         string
  customerId:   string
  type:         'percentage' | 'fixed'
  value:        number
  status:       'active' | 'used' | 'expired'
  expiresAt:    Date
}

export function makeCoupon(overrides: Partial<CouponData> = {}): CouponData {
  return {
    code:       'SAVE10',
    customerId: 'cust_123',
    type:       'percentage',
    value:      10,
    status:     'active',
    expiresAt:  new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    ...overrides,
  }
}
