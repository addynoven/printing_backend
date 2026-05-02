import { Customer, LOYALTY_TIERS, LoyaltyTier } from './customer.model'
import { Order } from '../orders/order.model'
import { NotFoundError, ConflictError } from '../../utils/AppError'

export interface CreateCustomerInput {
  name:  string
  phone: string
  email?: string
}

export interface UpdateCustomerInput {
  name?:  string
  phone?: string
  email?: string
}

export async function listCustomers(query: { search?: string; tier?: LoyaltyTier; limit?: number; skip?: number }) {
  const filter: Record<string, unknown> = { isActive: true }

  if (query.tier) filter.loyaltyTier = query.tier
  if (query.search) {
    filter.$or = [
      { name: { $regex: query.search, $options: 'i' } },
      { phone: { $regex: query.search, $options: 'i' } },
    ]
  }

  const [customers, total] = await Promise.all([
    Customer.find(filter)
      .sort({ lastVisit: -1 })
      .limit(query.limit ?? 50)
      .skip(query.skip ?? 0)
      .lean(),
    Customer.countDocuments(filter),
  ])

  return { customers, total }
}

export async function createCustomer(data: CreateCustomerInput) {
  const exists = await Customer.findOne({ phone: data.phone })
  if (exists) throw new ConflictError('Customer with this phone already exists')

  const customer = await Customer.create(data)
  return customer
}

export async function getCustomerById(id: string) {
  const customer = await Customer.findById(id).lean()
  if (!customer) throw new NotFoundError('Customer not found')
  return customer
}

export async function getCustomerByPhone(phone: string) {
  const customer = await Customer.findOne({ phone, isActive: true }).lean()
  if (!customer) throw new NotFoundError('Customer not found')
  return customer
}

export async function updateCustomer(id: string, data: UpdateCustomerInput) {
  if (data.phone) {
    const existing = await Customer.findOne({ phone: data.phone, _id: { $ne: id } })
    if (existing) throw new ConflictError('Phone number already in use')
  }

  const customer = await Customer.findByIdAndUpdate(id, data, { new: true, runValidators: true }).lean()
  if (!customer) throw new NotFoundError('Customer not found')
  return customer
}

export async function deleteCustomer(id: string) {
  const customer = await Customer.findByIdAndUpdate(id, { isActive: false }, { new: true }).lean()
  if (!customer) throw new NotFoundError('Customer not found')
  return customer
}

export async function updateCustomerStats(customerId: string, orderTotal: number) {
  const customer = await Customer.findById(customerId)
  if (!customer) return

  customer.visitCount += 1
  customer.totalSpend += orderTotal
  customer.lastVisit = new Date()

  // Auto-tier upgrade
  if (customer.totalSpend >= 50000 && customer.visitCount >= 20) {
    customer.loyaltyTier = 'platinum'
  } else if (customer.totalSpend >= 25000 && customer.visitCount >= 10) {
    customer.loyaltyTier = 'gold'
  } else if (customer.totalSpend >= 10000 && customer.visitCount >= 5) {
    customer.loyaltyTier = 'silver'
  }

  await customer.save()
  return customer
}

export async function getCustomerOrders(customerPhone: string) {
  const orders = await Order.find({ 'customer.phone': customerPhone })
    .sort({ createdAt: -1 })
    .lean()
  return { orders, total: orders.length }
}
