export type Action = 'create' | 'read' | 'update' | 'delete'
export type Resource = 'users' | 'orders' | 'tasks' | 'billing' | 'payments' | 'inventory' | 'machines' | 'analytics' | 'discounts' | 'attendance' | 'customers' | 'loyalty' | 'activity_logs'

export type ResourcePermission = Partial<Record<Action, boolean>> & { own?: boolean }
export type RolePermissions = Partial<Record<Resource, ResourcePermission>>

export const ROLES = [
  'super_admin', 'admin', 'sub_admin', 'designer',
  'flex_printing_staff', 'screen_printing_staff', 'helper_staff',
  'expose_staff', 'binder_staff', 'offset_staff', 'cutting_staff',
  'laser_cut_staff', 'acrylic_printing_staff', 'glass_printing_staff',
] as const

export type Role = typeof ROLES[number]

const staff: RolePermissions = {
  orders:     { read: true, own: true },
  tasks:      { read: true, update: true, own: true },
  inventory:  { read: true },
  attendance: { create: true, read: true },
}

export const PERMISSIONS: Record<Role, RolePermissions> = {
  super_admin: {
    users:     { create: true, read: true, update: true, delete: true },
    orders:    { create: true, read: true, update: true, delete: true },
    tasks:     { create: true, read: true, update: true, delete: true },
    billing:   { create: true, read: true, update: true, delete: true },
    payments:  { create: true, read: true, update: true, delete: true },
    inventory: { create: true, read: true, update: true, delete: true },
    machines:  { create: true, read: true, update: true, delete: true },
    analytics: { read: true },
    activity_logs: { read: true },
    discounts: { create: true, read: true, update: true, delete: true },
    attendance:{ create: true, read: true, update: true, delete: true },
    customers: { create: true, read: true, update: true, delete: true },
    loyalty:   { create: true, read: true, update: true, delete: true },
  },
  admin: {
    users:     { create: true, read: true, update: true },
    orders:    { create: true, read: true, update: true },
    tasks:     { create: true, read: true, update: true, delete: true },
    billing:   { read: true },
    payments:  { create: true, read: true, update: true },
    inventory: { create: true, read: true, update: true },
    machines:  { create: true, read: true, update: true },
    analytics: { read: true },
    activity_logs: { read: true },
    discounts: { create: true, read: true, update: true, delete: true },
    attendance:{ create: true, read: true, update: true, delete: true },
    customers: { create: true, read: true, update: true },
    loyalty:   { create: true, read: true, update: true, delete: true },
  },
  sub_admin: {
    users:     { read: true },
    orders:    { create: true, read: true, update: true },
    tasks:     { create: true, read: true, update: true },
    billing:   { read: true },
    payments:  { read: true },
    inventory: { read: true },
    machines:  { read: true },
    discounts: { read: true },
    attendance:{ create: true, read: true, update: true },
    customers: { create: true, read: true, update: true },
    loyalty:   { read: true },
    activity_logs: { read: true },
  },
  designer: {
    orders:    { read: true },
    tasks:     { create: true, read: true, update: true, own: true },
    inventory: { read: true },
  },
  flex_printing_staff:    staff,
  screen_printing_staff:  staff,
  helper_staff:           staff,
  expose_staff:           staff,
  binder_staff:           staff,
  offset_staff:           staff,
  cutting_staff:          staff,
  laser_cut_staff:        staff,
  acrylic_printing_staff: staff,
  glass_printing_staff:   staff,
}
