import 'dotenv/config'
import mongoose from 'mongoose'
import QRCode from 'qrcode'
import { User } from '../src/modules/auth/auth.model'
import { Machine } from '../src/modules/machines/machine.model'
import { Material, StockLedger } from '../src/modules/inventory/material.model'
import { Order } from '../src/modules/orders/order.model'
import { Task } from '../src/modules/tasks/task.model'
import { Bill } from '../src/modules/billing/bill.model'
import { Payment } from '../src/modules/payments/payment.model'
import { Notification } from '../src/modules/notifications/notification.model'
import { Barcode } from '../src/modules/barcode/barcode.model'

const ago  = (n: number) => new Date(Date.now() - n * 86_400_000)
const from = (n: number) => new Date(Date.now() + n * 86_400_000)
const qr   = (text: string) => QRCode.toDataURL(text, { width: 200, margin: 1 })

async function main() {
  if (process.env.NODE_ENV === 'production') {
    console.error('Refusing to run seed script in production')
    process.exit(1)
  }

  const uri = process.env.MONGODB_URI
  if (!uri) { console.error('MONGODB_URI not set'); process.exit(1) }

  await mongoose.connect(uri)
  console.log('Connected to MongoDB')

  // ── Wipe ──────────────────────────────────────────────────────────────────
  console.log('Clearing existing data...')
  await Promise.all([
    User.deleteMany({}), Machine.deleteMany({}),
    Material.deleteMany({}), StockLedger.deleteMany({}),
    Order.deleteMany({}), Task.deleteMany({}),
    Bill.deleteMany({}), Payment.deleteMany({}),
    Notification.deleteMany({}), Barcode.deleteMany({}),
  ])

  // ── Users ─────────────────────────────────────────────────────────────────
  console.log('Seeding users...')
  // create() is used so the pre-save bcrypt hook fires for each doc
  const [
    superAdmin,
    admin1, admin2,
    subAdmin1, subAdmin2,
    designer1, designer2,
    flexStaff1, flexStaff2,
    screenStaff1, screenStaff2,
    helperStaff1, helperStaff2,
    exposeStaff1, exposeStaff2,
    binderStaff1, binderStaff2,
    offsetStaff1, offsetStaff2,
    cuttingStaff1, cuttingStaff2,
    laserStaff1, laserStaff2,
    acrylicStaff1, acrylicStaff2,
    glassStaff1, glassStaff2,
  ] = await Promise.all([
    User.create({ name: 'Super Admin',      email: 'admin@poms.dev',           password: 'Admin@1234', role: 'super_admin',           phone: '9999000001' }),
    User.create({ name: 'Rahul Sharma',     email: 'rahul.admin@poms.dev',     password: 'Staff@1234', role: 'admin',                 phone: '9999000002' }),
    User.create({ name: 'Priya Mehta',      email: 'priya.admin@poms.dev',     password: 'Staff@1234', role: 'admin',                 phone: '9999000003' }),
    User.create({ name: 'Arjun Nair',       email: 'arjun.sub@poms.dev',       password: 'Staff@1234', role: 'sub_admin',             phone: '9999000004' }),
    User.create({ name: 'Kavya Reddy',      email: 'kavya.sub@poms.dev',       password: 'Staff@1234', role: 'sub_admin',             phone: '9999000005' }),
    User.create({ name: 'Aditya Kumar',     email: 'aditya.design@poms.dev',   password: 'Staff@1234', role: 'designer',              phone: '9999000006' }),
    User.create({ name: 'Sneha Iyer',       email: 'sneha.design@poms.dev',    password: 'Staff@1234', role: 'designer',              phone: '9999000007' }),
    User.create({ name: 'Ravi Patel',       email: 'ravi.flex@poms.dev',       password: 'Staff@1234', role: 'flex_printing_staff',   phone: '9999000008' }),
    User.create({ name: 'Mohan Das',        email: 'mohan.flex@poms.dev',      password: 'Staff@1234', role: 'flex_printing_staff',   phone: '9999000009' }),
    User.create({ name: 'Suresh Kumar',     email: 'suresh.screen@poms.dev',   password: 'Staff@1234', role: 'screen_printing_staff', phone: '9999000010' }),
    User.create({ name: 'Ganesh Rao',       email: 'ganesh.screen@poms.dev',   password: 'Staff@1234', role: 'screen_printing_staff', phone: '9999000011' }),
    User.create({ name: 'Ramesh Singh',     email: 'ramesh.helper@poms.dev',   password: 'Staff@1234', role: 'helper_staff',          phone: '9999000012' }),
    User.create({ name: 'Vijay Kumar',      email: 'vijay.helper@poms.dev',    password: 'Staff@1234', role: 'helper_staff',          phone: '9999000013' }),
    User.create({ name: 'Kiran Babu',       email: 'kiran.expose@poms.dev',    password: 'Staff@1234', role: 'expose_staff',          phone: '9999000014' }),
    User.create({ name: 'Deepak Verma',     email: 'deepak.expose@poms.dev',   password: 'Staff@1234', role: 'expose_staff',          phone: '9999000015' }),
    User.create({ name: 'Ajay Tiwari',      email: 'ajay.binder@poms.dev',     password: 'Staff@1234', role: 'binder_staff',          phone: '9999000016' }),
    User.create({ name: 'Sanjay Gupta',     email: 'sanjay.binder@poms.dev',   password: 'Staff@1234', role: 'binder_staff',          phone: '9999000017' }),
    User.create({ name: 'Prakash Yadav',    email: 'prakash.offset@poms.dev',  password: 'Staff@1234', role: 'offset_staff',          phone: '9999000018' }),
    User.create({ name: 'Manoj Mishra',     email: 'manoj.offset@poms.dev',    password: 'Staff@1234', role: 'offset_staff',          phone: '9999000019' }),
    User.create({ name: 'Srikant Pillai',   email: 'srikant.cut@poms.dev',     password: 'Staff@1234', role: 'cutting_staff',         phone: '9999000020' }),
    User.create({ name: 'Balu Nair',        email: 'balu.cut@poms.dev',        password: 'Staff@1234', role: 'cutting_staff',         phone: '9999000021' }),
    User.create({ name: 'Nikhil Joshi',     email: 'nikhil.laser@poms.dev',    password: 'Staff@1234', role: 'laser_cut_staff',       phone: '9999000022' }),
    User.create({ name: 'Rohit Saxena',     email: 'rohit.laser@poms.dev',     password: 'Staff@1234', role: 'laser_cut_staff',       phone: '9999000023' }),
    User.create({ name: 'Ashok Patil',      email: 'ashok.acrylic@poms.dev',   password: 'Staff@1234', role: 'acrylic_printing_staff',phone: '9999000024' }),
    User.create({ name: 'Vinod Desai',      email: 'vinod.acrylic@poms.dev',   password: 'Staff@1234', role: 'acrylic_printing_staff',phone: '9999000025' }),
    User.create({ name: 'Harish Menon',     email: 'harish.glass@poms.dev',    password: 'Staff@1234', role: 'glass_printing_staff',  phone: '9999000026' }),
    User.create({ name: 'Sunil Kadam',      email: 'sunil.glass@poms.dev',     password: 'Staff@1234', role: 'glass_printing_staff',  phone: '9999000027' }),
  ])
  console.log('✓ 27 users seeded')

  // ── Machines ──────────────────────────────────────────────────────────────
  console.log('Seeding machines...')
  await Machine.insertMany([
    { name: 'Roland XR-640',          type: 'flex_printer',    department: 'Flex Section',    status: 'active' },
    { name: 'Mimaki JV150',           type: 'flex_printer',    department: 'Flex Section',    status: 'active' },
    { name: 'M&R Challenger',         type: 'screen_printer',  department: 'Screen Section',  status: 'active' },
    { name: 'Anatol VOLT',            type: 'screen_printer',  department: 'Screen Section',  status: 'maintenance', notes: 'Routine belt replacement due' },
    { name: 'Trotec Speedy 400',      type: 'laser_cutter',    department: 'Laser Section',   status: 'active' },
    { name: 'Boss LS-2440',           type: 'laser_cutter',    department: 'Laser Section',   status: 'inactive',    notes: 'Awaiting spare parts' },
    { name: 'Heidelberg GTO 52',      type: 'offset_printer',  department: 'Offset Section',  status: 'active' },
    { name: 'Mimaki UJF-6042',        type: 'acrylic_printer', department: 'Acrylic Section', status: 'active' },
    { name: 'Durst P5 250',           type: 'glass_printer',   department: 'Glass Section',   status: 'active' },
  ])
  console.log('✓ 9 machines seeded')

  // ── Materials ─────────────────────────────────────────────────────────────
  console.log('Seeding materials...')
  const [
    flexVinyl, backlit,
    blackInk, cyanInk, magentaInk, yellowInk,
    a4Paper, a3Paper,
    acrylicSheet, glassPanel, bindingRings, screenMesh,
  ] = await Promise.all([
    Material.create({ name: 'Flex Vinyl Roll 10ft',        category: 'flex',   unit: 'sqft',   stock: 850,   threshold: 200,  costPerUnit: 12,   supplier: { name: 'VinylPro Supplies', phone: '9876543210', email: 'sales@vinylpro.in' } }),
    Material.create({ name: 'Backlit Flex Roll 10ft',      category: 'flex',   unit: 'sqft',   stock: 420,   threshold: 150,  costPerUnit: 18,   supplier: { name: 'VinylPro Supplies', phone: '9876543210', email: 'sales@vinylpro.in' } }),
    Material.create({ name: 'Eco Solvent Ink Black',       category: 'ink',    unit: 'ml',     stock: 12000, threshold: 2000, costPerUnit: 0.8,  supplier: { name: 'InkWorld India',    phone: '9876540001', email: 'orders@inkworld.in' } }),
    Material.create({ name: 'Eco Solvent Ink Cyan',        category: 'ink',    unit: 'ml',     stock: 9500,  threshold: 2000, costPerUnit: 0.9,  supplier: { name: 'InkWorld India',    phone: '9876540001', email: 'orders@inkworld.in' } }),
    Material.create({ name: 'Eco Solvent Ink Magenta',     category: 'ink',    unit: 'ml',     stock: 8800,  threshold: 2000, costPerUnit: 0.9,  supplier: { name: 'InkWorld India',    phone: '9876540001', email: 'orders@inkworld.in' } }),
    Material.create({ name: 'Eco Solvent Ink Yellow',      category: 'ink',    unit: 'ml',     stock: 7200,  threshold: 2000, costPerUnit: 0.85, supplier: { name: 'InkWorld India',    phone: '9876540001', email: 'orders@inkworld.in' } }),
    Material.create({ name: 'A4 Matte Paper 120gsm',       category: 'paper',  unit: 'sheets', stock: 3500,  threshold: 500,  costPerUnit: 1.2,  supplier: { name: 'PaperMart',         phone: '9876540002', email: 'bulk@papermart.in' } }),
    Material.create({ name: 'A3 Glossy Paper 150gsm',      category: 'paper',  unit: 'sheets', stock: 1800,  threshold: 300,  costPerUnit: 2.5,  supplier: { name: 'PaperMart',         phone: '9876540002', email: 'bulk@papermart.in' } }),
    Material.create({ name: 'Acrylic Sheet 3mm Clear',     category: 'acrylic',unit: 'pcs',    stock: 120,   threshold: 20,   costPerUnit: 350,  supplier: { name: 'AcrylicHub',        phone: '9876540003', email: 'supply@acrylicHub.in' } }),
    Material.create({ name: 'Toughened Glass 6mm',         category: 'glass',  unit: 'pcs',    stock: 45,    threshold: 10,   costPerUnit: 800,  supplier: { name: 'GlassTech India',   phone: '9876540004', email: 'orders@glasstech.in' } }),
    Material.create({ name: 'Spiral Binding Rings 14mm',   category: 'other',  unit: 'pcs',    stock: 800,   threshold: 100,  costPerUnit: 8,    supplier: { name: 'Office Supplies Co',phone: '9876540005' } }),
    Material.create({ name: 'Screen Printing Mesh 110T',   category: 'other',  unit: 'pcs',    stock: 40,    threshold: 8,    costPerUnit: 450,  supplier: { name: 'ScreenTech India',  phone: '9876540006' } }),
  ])
  console.log('✓ 12 materials seeded')

  // Initial RESTOCK ledger entries
  const allMats = [flexVinyl, backlit, blackInk, cyanInk, magentaInk, yellowInk, a4Paper, a3Paper, acrylicSheet, glassPanel, bindingRings, screenMesh]
  await StockLedger.insertMany(allMats.map(m => ({
    materialId: m._id, type: 'RESTOCK', qty: m.stock, balanceAfter: m.stock,
    note: 'Initial stock entry', performedBy: admin1._id,
  })))

  // ── Orders (sequential — orderNumber uses countDocuments) ─────────────────
  console.log('Seeding orders...')
  const year = new Date().getFullYear()

  const mkHistory = (steps: Array<[string, mongoose.Types.ObjectId, number, string?]>) =>
    steps.map(([status, by, daysAgoN, note]) => ({
      status, changedBy: by, at: ago(daysAgoN), ...(note ? { note } : {}),
    }))

  const o1 = await Order.create({
    customer: { name: 'Sunrise Events', phone: '9876501001', email: 'events@sunrise.in' },
    jobType: 'flex_printing',
    items: [{ description: 'Outdoor Flex Banner 10x4ft', quantity: 5, unit: 'pcs', unitPrice: 800 }],
    bom: [
      { materialId: flexVinyl._id, name: flexVinyl.name, unit: 'sqft', qty: 200 },
      { materialId: blackInk._id,  name: blackInk.name,  unit: 'ml',   qty: 500 },
    ],
    rawCost: 3200, taxableValue: 4000, billSplitPct: 80, hsnCode: '4911',
    status: 'invoiced',
    statusHistory: mkHistory([
      ['draft',         admin1._id, 12, 'Order created'],
      ['confirmed',     admin1._id, 11, 'Customer confirmed'],
      ['designing',     admin1._id, 10],
      ['in_production', admin1._id, 8],
      ['finishing',     admin1._id, 6],
      ['completed',     admin1._id, 5],
      ['invoiced',      admin1._id, 3],
    ]),
    priority: 'normal', deadline: ago(4),
    assignedTo: flexStaff1._id, advancePaid: 2000, createdBy: admin1._id, createdAt: ago(12),
  })

  const o2 = await Order.create({
    customer: { name: 'Tech Startup Hub', phone: '9876502002', email: 'order@techstartup.io' },
    jobType: 'design',
    items: [{ description: 'Logo Design + Brand Kit', quantity: 1, unit: 'set', unitPrice: 5000 }],
    bom: [],
    rawCost: 3500, taxableValue: 5000, billSplitPct: 70,
    status: 'completed',
    statusHistory: mkHistory([
      ['draft',     admin2._id, 9, 'Received via WhatsApp'],
      ['confirmed', admin2._id, 8],
      ['designing', admin2._id, 7],
      ['completed', admin2._id, 2],
    ]),
    priority: 'normal', deadline: ago(1),
    assignedTo: designer1._id, advancePaid: 2500, createdBy: admin2._id, createdAt: ago(9),
  })

  const o3 = await Order.create({
    customer: { name: 'City Mall Management', phone: '9876503003', email: 'mktg@citymall.in' },
    jobType: 'screen_printing',
    items: [
      { description: 'T-Shirt Screen Print Black',  quantity: 100, unit: 'pcs', unitPrice: 120 },
      { description: 'Setup charges',               quantity: 1,   unit: 'set', unitPrice: 500 },
    ],
    bom: [
      { materialId: blackInk._id,   name: blackInk.name,   unit: 'ml',  qty: 1500 },
      { materialId: screenMesh._id, name: screenMesh.name, unit: 'pcs', qty: 2 },
    ],
    rawCost: 8500, taxableValue: 12500, billSplitPct: 68,
    status: 'in_production',
    statusHistory: mkHistory([
      ['draft',         admin1._id, 5],
      ['confirmed',     admin1._id, 4],
      ['designing',     admin1._id, 3],
      ['in_production', admin1._id, 1],
    ]),
    priority: 'urgent', deadline: from(2),
    assignedTo: screenStaff1._id, advancePaid: 5000, createdBy: admin1._id, createdAt: ago(5),
  })

  const o4 = await Order.create({
    customer: { name: 'Heritage Sweets', phone: '9876504004', email: '' },
    jobType: 'offset',
    items: [{ description: 'Visiting Cards 500pcs 2-sided', quantity: 500, unit: 'pcs', unitPrice: 1.5 }],
    bom: [{ materialId: a4Paper._id, name: a4Paper.name, unit: 'sheets', qty: 100 }],
    rawCost: 600, taxableValue: 750, billSplitPct: 80,
    status: 'designing',
    statusHistory: mkHistory([
      ['draft',     subAdmin1._id, 3],
      ['confirmed', subAdmin1._id, 2],
      ['designing', subAdmin1._id, 1],
    ]),
    priority: 'normal', deadline: from(3),
    assignedTo: designer2._id, advancePaid: 0, createdBy: subAdmin1._id, createdAt: ago(3),
  })

  const o5 = await Order.create({
    customer: { name: 'Royal Garments', phone: '9876505005', email: 'orders@royalgarments.in' },
    jobType: 'flex_printing',
    items: [
      { description: 'Shop Signage Banner 6x3ft', quantity: 2, unit: 'pcs', unitPrice: 1200 },
      { description: 'A-Frame Standee',           quantity: 4, unit: 'pcs', unitPrice: 600  },
    ],
    bom: [
      { materialId: flexVinyl._id, name: flexVinyl.name, unit: 'sqft', qty: 90 },
      { materialId: cyanInk._id,   name: cyanInk.name,   unit: 'ml',   qty: 300 },
    ],
    rawCost: 3000, taxableValue: 4800, billSplitPct: 62.5,
    status: 'confirmed',
    statusHistory: mkHistory([['draft', admin1._id, 2], ['confirmed', admin1._id, 1]]),
    priority: 'normal', deadline: from(5),
    assignedTo: flexStaff2._id, advancePaid: 1500, createdBy: admin1._id, createdAt: ago(2),
  })

  const o6 = await Order.create({
    customer: { name: 'Bhavani Catering', phone: '9876506006', email: '' },
    jobType: 'laser_cut',
    items: [{ description: 'Acrylic Name Plates 6x4in', quantity: 20, unit: 'pcs', unitPrice: 250 }],
    bom: [{ materialId: acrylicSheet._id, name: acrylicSheet.name, unit: 'pcs', qty: 5 }],
    rawCost: 4000, taxableValue: 5000, billSplitPct: 80,
    status: 'draft',
    statusHistory: mkHistory([['draft', subAdmin2._id, 0]]),
    priority: 'normal', deadline: from(7),
    advancePaid: 0, createdBy: subAdmin2._id, createdAt: new Date(),
  })

  const o7 = await Order.create({
    customer: { name: 'Metro Hospital', phone: '9876507007', email: 'procurement@metrohospital.in' },
    jobType: 'acrylic',
    items: [{ description: 'Department Name Board Acrylic 12x6in', quantity: 30, unit: 'pcs', unitPrice: 550 }],
    bom: [{ materialId: acrylicSheet._id, name: acrylicSheet.name, unit: 'pcs', qty: 10 }],
    rawCost: 12000, taxableValue: 16500, billSplitPct: 72.7,
    status: 'finishing',
    statusHistory: mkHistory([
      ['draft',         admin2._id, 8],
      ['confirmed',     admin2._id, 7],
      ['designing',     admin2._id, 6],
      ['in_production', admin2._id, 4],
      ['finishing',     admin2._id, 1],
    ]),
    priority: 'urgent', deadline: from(1),
    assignedTo: acrylicStaff1._id, advancePaid: 8000, createdBy: admin2._id, createdAt: ago(8),
  })

  const o8 = await Order.create({
    customer: { name: 'Weekend Bazaar', phone: '9876508008', email: '' },
    jobType: 'flex_printing',
    items: [{ description: 'Event Banners 4x3ft', quantity: 10, unit: 'pcs', unitPrice: 600 }],
    bom: [{ materialId: flexVinyl._id, name: flexVinyl.name, unit: 'sqft', qty: 120 }],
    rawCost: 4800, taxableValue: 6000, billSplitPct: 80,
    status: 'cancelled',
    statusHistory: mkHistory([
      ['draft',      admin1._id, 6],
      ['confirmed',  admin1._id, 5],
      ['cancelled',  admin1._id, 4, 'Customer cancelled — event postponed'],
    ]),
    priority: 'normal', deadline: ago(2),
    advancePaid: 0, createdBy: admin1._id, createdAt: ago(6),
  })

  const o9 = await Order.create({
    customer: { name: 'Shree Jewellers', phone: '9876509009', email: 'shree.jewels@gmail.com' },
    jobType: 'glass',
    items: [{ description: 'Glass Showcase Print Logo + Product', quantity: 4, unit: 'pcs', unitPrice: 1800 }],
    bom: [{ materialId: glassPanel._id, name: glassPanel.name, unit: 'pcs', qty: 4 }],
    rawCost: 5600, taxableValue: 7200, billSplitPct: 77.8,
    status: 'draft',
    statusHistory: mkHistory([['draft', admin2._id, 0]]),
    priority: 'urgent', deadline: from(3),
    advancePaid: 3600, createdBy: admin2._id, createdAt: new Date(),
  })

  const o10 = await Order.create({
    customer: { name: 'Green Valley School', phone: '9876510010', email: 'office@greenvalleyschool.edu' },
    jobType: 'binding',
    items: [{ description: 'Spiral Bound Year Book A4', quantity: 200, unit: 'pcs', unitPrice: 85 }],
    bom: [
      { materialId: a4Paper._id,      name: a4Paper.name,      unit: 'sheets', qty: 800 },
      { materialId: bindingRings._id, name: bindingRings.name, unit: 'pcs',    qty: 200 },
    ],
    rawCost: 12000, taxableValue: 17000, billSplitPct: 70.6,
    status: 'in_production',
    statusHistory: mkHistory([
      ['draft',         subAdmin1._id, 7],
      ['confirmed',     subAdmin1._id, 6],
      ['designing',     subAdmin1._id, 5],
      ['in_production', subAdmin1._id, 2],
    ]),
    priority: 'normal', deadline: from(4),
    assignedTo: binderStaff1._id, advancePaid: 8500, createdBy: subAdmin1._id, createdAt: ago(7),
  })

  const o11 = await Order.create({
    customer: { name: 'Speedway Motors', phone: '9876511011', email: 'promo@speedway.in' },
    jobType: 'screen_printing',
    items: [{ description: 'Polo T-Shirt Print Brand Logo', quantity: 50, unit: 'pcs', unitPrice: 150 }],
    bom: [
      { materialId: blackInk._id,   name: blackInk.name,   unit: 'ml',  qty: 800 },
      { materialId: screenMesh._id, name: screenMesh.name, unit: 'pcs', qty: 1 },
    ],
    rawCost: 5500, taxableValue: 7500, billSplitPct: 73.3,
    status: 'confirmed',
    statusHistory: mkHistory([['draft', admin1._id, 1], ['confirmed', admin1._id, 0]]),
    priority: 'normal', deadline: from(6),
    assignedTo: screenStaff2._id, advancePaid: 3000, createdBy: admin1._id, createdAt: ago(1),
  })

  const o12 = await Order.create({
    customer: { name: 'Gowri Construction', phone: '9876512012', email: '' },
    jobType: 'flex_printing',
    items: [
      { description: 'Site Hoarding 20x10ft',     quantity: 1, unit: 'pcs', unitPrice: 6000 },
      { description: 'Safety Signage Boards',      quantity: 8, unit: 'pcs', unitPrice: 400 },
    ],
    bom: [
      { materialId: backlit._id,  name: backlit.name,  unit: 'sqft', qty: 200 },
      { materialId: cyanInk._id,  name: cyanInk.name,  unit: 'ml',   qty: 600 },
    ],
    rawCost: 7200, taxableValue: 9200, billSplitPct: 78.3,
    status: 'designing',
    statusHistory: mkHistory([
      ['draft',     admin2._id, 4],
      ['confirmed', admin2._id, 3],
      ['designing', admin2._id, 1],
    ]),
    priority: 'normal', deadline: from(5),
    assignedTo: designer1._id, advancePaid: 4600, createdBy: admin2._id, createdAt: ago(4),
  })

  const o13 = await Order.create({
    customer: { name: 'Urban Cafe', phone: '9876513013', email: 'hello@urbancafe.in' },
    jobType: 'laser_cut',
    items: [{ description: 'Wooden Laser Cut Menu Board', quantity: 6, unit: 'pcs', unitPrice: 700 }],
    bom: [],
    rawCost: 3200, taxableValue: 4200, billSplitPct: 76.2,
    status: 'completed',
    statusHistory: mkHistory([
      ['draft',         admin1._id, 15],
      ['confirmed',     admin1._id, 14],
      ['designing',     admin1._id, 12],
      ['in_production', admin1._id, 10],
      ['finishing',     admin1._id, 7],
      ['completed',     admin1._id, 6],
    ]),
    priority: 'normal', deadline: ago(5),
    assignedTo: laserStaff1._id, advancePaid: 2000, createdBy: admin1._id, createdAt: ago(15),
  })

  const o14 = await Order.create({
    customer: { name: 'Prakash Kirana', phone: '9876514014', email: '' },
    jobType: 'offset',
    items: [{ description: 'Price List Pamphlet A5 2-sided', quantity: 1000, unit: 'pcs', unitPrice: 1.8 }],
    bom: [{ materialId: a4Paper._id, name: a4Paper.name, unit: 'sheets', qty: 500 }],
    rawCost: 1200, taxableValue: 1800, billSplitPct: 66.7,
    status: 'draft',
    statusHistory: mkHistory([['draft', subAdmin2._id, 0]]),
    priority: 'normal', deadline: from(5),
    advancePaid: 0, createdBy: subAdmin2._id, createdAt: new Date(),
  })

  const o15 = await Order.create({
    customer: { name: 'Lakshmi Sarees', phone: '9876515015', email: 'laxmisarees@gmail.com' },
    jobType: 'flex_printing',
    items: [
      { description: 'Storefront Banner 12x5ft', quantity: 1, unit: 'pcs', unitPrice: 3000 },
      { description: 'Side Banners 4x2ft',       quantity: 4, unit: 'pcs', unitPrice: 800  },
    ],
    bom: [{ materialId: backlit._id, name: backlit.name, unit: 'sqft', qty: 100 }],
    rawCost: 4800, taxableValue: 6200, billSplitPct: 77.4,
    status: 'invoiced',
    statusHistory: mkHistory([
      ['draft',         admin2._id, 20],
      ['confirmed',     admin2._id, 19],
      ['designing',     admin2._id, 17],
      ['in_production', admin2._id, 15],
      ['finishing',     admin2._id, 13],
      ['completed',     admin2._id, 12],
      ['invoiced',      admin2._id, 10],
    ]),
    priority: 'normal', deadline: ago(11),
    assignedTo: flexStaff1._id, advancePaid: 3100, createdBy: admin2._id, createdAt: ago(20),
  })

  console.log('✓ 15 orders seeded')

  // ── Tasks ─────────────────────────────────────────────────────────────────
  console.log('Seeding tasks...')
  await Task.insertMany([
    // o1 invoiced
    { orderId: o1._id,  type: 'flex_printing',   assignedTo: flexStaff1._id,   status: 'done',        priority: 'normal', startedAt: ago(9),  completedAt: ago(6),  totalMinutes: 180, notes: 'Completed without issues' },
    // o2 completed
    { orderId: o2._id,  type: 'design',           assignedTo: designer1._id,    status: 'done',        priority: 'normal', startedAt: ago(8),  completedAt: ago(2),  totalMinutes: 360, notes: 'Client requested 2 revisions' },
    // o3 in_production
    { orderId: o3._id,  type: 'design',           assignedTo: designer2._id,    status: 'done',        priority: 'urgent', startedAt: ago(3),  completedAt: ago(2),  totalMinutes: 120 },
    { orderId: o3._id,  type: 'screen_printing',  assignedTo: screenStaff1._id, status: 'in_progress', priority: 'urgent', startedAt: ago(1),  totalMinutes: 45 },
    // o4 designing
    { orderId: o4._id,  type: 'design',           assignedTo: designer2._id,    status: 'in_progress', priority: 'normal', startedAt: ago(1),  totalMinutes: 60 },
    // o5 confirmed
    { orderId: o5._id,  type: 'flex_printing',    assignedTo: flexStaff2._id,   status: 'assigned',    priority: 'normal', totalMinutes: 0 },
    // o7 finishing
    { orderId: o7._id,  type: 'acrylic',          assignedTo: acrylicStaff1._id,status: 'paused',      priority: 'urgent', startedAt: ago(3), pausedAt: ago(1), totalMinutes: 240 },
    // o10 in_production
    { orderId: o10._id, type: 'design',           assignedTo: designer1._id,    status: 'done',        priority: 'normal', startedAt: ago(5),  completedAt: ago(3),  totalMinutes: 180 },
    { orderId: o10._id, type: 'binding',          assignedTo: binderStaff1._id, status: 'in_progress', priority: 'normal', startedAt: ago(2),  totalMinutes: 90 },
    // o11 confirmed
    { orderId: o11._id, type: 'screen_printing',  assignedTo: screenStaff2._id, status: 'assigned',    priority: 'normal', totalMinutes: 0 },
    // o12 designing
    { orderId: o12._id, type: 'design',           assignedTo: designer1._id,    status: 'in_progress', priority: 'normal', startedAt: ago(1),  totalMinutes: 90 },
    { orderId: o12._id, type: 'flex_printing',    assignedTo: flexStaff1._id,   status: 'assigned',    priority: 'normal', totalMinutes: 0 },
    // o13 completed
    { orderId: o13._id, type: 'design',           assignedTo: designer2._id,    status: 'done',        priority: 'normal', startedAt: ago(12), completedAt: ago(10), totalMinutes: 180 },
    { orderId: o13._id, type: 'laser_cut',        assignedTo: laserStaff1._id,  status: 'done',        priority: 'normal', startedAt: ago(9),  completedAt: ago(7),  totalMinutes: 240 },
    // o15 invoiced
    { orderId: o15._id, type: 'design',           assignedTo: designer2._id,    status: 'done',        priority: 'normal', startedAt: ago(19), completedAt: ago(18), totalMinutes: 150 },
    { orderId: o15._id, type: 'flex_printing',    assignedTo: flexStaff1._id,   status: 'done',        priority: 'normal', startedAt: ago(17), completedAt: ago(13), totalMinutes: 120 },
  ])
  console.log('✓ 16 tasks seeded')

  // ── Bills ─────────────────────────────────────────────────────────────────
  console.log('Seeding bills...')
  const lineItems = (o: typeof o1) =>
    o.items.map(i => ({ description: i.description, qty: i.quantity, rate: i.unitPrice, amount: i.quantity * i.unitPrice }))

  const [b1raw, b1gst, b2raw, b13raw, b15raw, b15gst] = await Promise.all([
    Bill.create({ orderId: o1._id,  type: 'raw', seriesNumber: `RAW-${year}-001`, amount: o1.rawCost,  isProtected: true,  lineItems: lineItems(o1),  createdBy: admin1._id, createdAt: ago(5) }),
    Bill.create({ orderId: o1._id,  type: 'gst', seriesNumber: `TAX-${year}-001`, amount: o1.taxableValue, isProtected: false, lineItems: lineItems(o1), gstin: '29AABCT1332L1ZQ', hsnCode: '4911', taxableAmount: o1.taxableValue, cgst: o1.taxableValue * 0.09, sgst: o1.taxableValue * 0.09, totalAmount: o1.taxableValue * 1.18, createdBy: admin1._id, createdAt: ago(3) }),
    Bill.create({ orderId: o2._id,  type: 'raw', seriesNumber: `RAW-${year}-002`, amount: o2.rawCost,  isProtected: true,  lineItems: lineItems(o2),  createdBy: admin2._id, createdAt: ago(2) }),
    Bill.create({ orderId: o13._id, type: 'raw', seriesNumber: `RAW-${year}-003`, amount: o13.rawCost, isProtected: true,  lineItems: lineItems(o13), createdBy: admin1._id, createdAt: ago(6) }),
    Bill.create({ orderId: o15._id, type: 'raw', seriesNumber: `RAW-${year}-004`, amount: o15.rawCost, isProtected: true,  lineItems: lineItems(o15), createdBy: admin2._id, createdAt: ago(12) }),
    Bill.create({ orderId: o15._id, type: 'gst', seriesNumber: `TAX-${year}-002`, amount: o15.taxableValue, isProtected: false, lineItems: lineItems(o15), gstin: '29AABCT1332L1ZQ', taxableAmount: o15.taxableValue, cgst: o15.taxableValue * 0.09, sgst: o15.taxableValue * 0.09, totalAmount: o15.taxableValue * 1.18, createdBy: admin2._id, createdAt: ago(10) }),
  ])
  console.log('✓ 6 bills seeded')

  // ── Payments ──────────────────────────────────────────────────────────────
  console.log('Seeding payments...')
  await Payment.insertMany([
    { orderId: o1._id,  billId: b1gst._id,  type: 'advance',  amount: 2000,                             method: 'upi',  status: 'completed', referenceId: 'UPI202600001', collectedBy: admin1._id,   paidAt: ago(11) },
    { orderId: o1._id,  billId: b1gst._id,  type: 'final',    amount: o1.taxableValue * 1.18 - 2000,    method: 'cash', status: 'completed',                              collectedBy: admin1._id,   paidAt: ago(3)  },
    { orderId: o2._id,  billId: b2raw._id,  type: 'advance',  amount: 2500,                             method: 'upi',  status: 'completed', referenceId: 'UPI202600002', collectedBy: admin2._id,   paidAt: ago(8)  },
    { orderId: o3._id,                      type: 'advance',  amount: 5000,                             method: 'cash', status: 'completed',                              collectedBy: admin1._id,   paidAt: ago(4)  },
    { orderId: o5._id,                      type: 'advance',  amount: 1500,                             method: 'upi',  status: 'completed', referenceId: 'UPI202600003', collectedBy: admin1._id,   paidAt: ago(1)  },
    { orderId: o7._id,                      type: 'advance',  amount: 8000,                             method: 'card', status: 'completed', referenceId: 'CARD20260001', collectedBy: admin2._id,   paidAt: ago(7)  },
    { orderId: o10._id,                     type: 'advance',  amount: 8500,                             method: 'upi',  status: 'completed', referenceId: 'UPI202600004', collectedBy: subAdmin1._id,paidAt: ago(6)  },
    { orderId: o13._id, billId: b13raw._id, type: 'advance',  amount: 2000,                             method: 'cash', status: 'completed',                              collectedBy: admin1._id,   paidAt: ago(14) },
    { orderId: o13._id, billId: b13raw._id, type: 'final',    amount: o13.rawCost - 2000,               method: 'upi',  status: 'completed', referenceId: 'UPI202600005', collectedBy: admin1._id,   paidAt: ago(6)  },
    { orderId: o15._id, billId: b15gst._id, type: 'advance',  amount: 3100,                             method: 'upi',  status: 'completed', referenceId: 'UPI202600006', collectedBy: admin2._id,   paidAt: ago(19) },
    { orderId: o15._id, billId: b15gst._id, type: 'final',    amount: o15.taxableValue * 1.18 - 3100,   method: 'cash', status: 'completed',                              collectedBy: admin2._id,   paidAt: ago(10) },
    { orderId: o9._id,                      type: 'advance',  amount: 3600,                             method: 'upi',  status: 'completed', referenceId: 'UPI202600007', collectedBy: admin2._id,   paidAt: new Date() },
  ])
  console.log('✓ 12 payments seeded')

  // ── Notifications ─────────────────────────────────────────────────────────
  console.log('Seeding notifications...')
  await Notification.insertMany([
    { userId: flexStaff1._id,   type: 'task_assigned',    title: 'New task assigned',     message: 'Flex printing task for Sunrise Events assigned to you',            resourceId: o1._id,          resourceType: 'order',    read: true  },
    { userId: designer1._id,    type: 'task_assigned',    title: 'New task assigned',     message: 'Brand kit design for Tech Startup Hub assigned to you',            resourceId: o2._id,          resourceType: 'order',    read: true  },
    { userId: screenStaff1._id, type: 'task_assigned',    title: 'Urgent task assigned',  message: 'Urgent screen printing for City Mall — deadline in 2 days',        resourceId: o3._id,          resourceType: 'order',    read: false },
    { userId: designer2._id,    type: 'task_assigned',    title: 'New task assigned',     message: 'Visiting card design for Heritage Sweets assigned to you',          resourceId: o4._id,          resourceType: 'order',    read: false },
    { userId: flexStaff2._id,   type: 'task_assigned',    title: 'New task assigned',     message: 'Flex printing task for Royal Garments is ready to start',          resourceId: o5._id,          resourceType: 'order',    read: false },
    { userId: acrylicStaff1._id,type: 'task_assigned',    title: 'Urgent task assigned',  message: 'Acrylic board production for Metro Hospital — due tomorrow',        resourceId: o7._id,          resourceType: 'order',    read: false },
    { userId: binderStaff1._id, type: 'task_assigned',    title: 'New task assigned',     message: 'Year book binding for Green Valley School in progress',            resourceId: o10._id,         resourceType: 'order',    read: false },
    { userId: screenStaff2._id, type: 'task_assigned',    title: 'New task assigned',     message: 'T-shirt print for Speedway Motors has been confirmed',             resourceId: o11._id,         resourceType: 'order',    read: false },
    { userId: admin1._id,       type: 'order_completed',  title: 'Order completed',       message: 'Sunrise Events order is complete and ready for billing',           resourceId: o1._id,          resourceType: 'order',    read: true  },
    { userId: admin2._id,       type: 'order_completed',  title: 'Order completed',       message: 'Tech Startup Hub design order is complete',                       resourceId: o2._id,          resourceType: 'order',    read: true  },
    { userId: admin1._id,       type: 'order_completed',  title: 'Order completed',       message: 'Urban Cafe laser cut order is complete',                          resourceId: o13._id,         resourceType: 'order',    read: false },
    { userId: admin2._id,       type: 'payment_received', title: 'Payment received',      message: 'Advance ₹8,000 received from Metro Hospital',                     resourceId: o7._id,          resourceType: 'payment',  read: false },
    { userId: admin1._id,       type: 'payment_received', title: 'Payment received',      message: 'Final payment received for Sunrise Events — order fully settled',  resourceId: o1._id,          resourceType: 'payment',  read: true  },
    { userId: admin1._id,       type: 'low_stock',        title: 'Low stock alert',       message: 'Screen Printing Mesh 110T is running low — 40 pcs remaining',     resourceId: screenMesh._id,  resourceType: 'material', read: false },
    { userId: admin2._id,       type: 'low_stock',        title: 'Low stock alert',       message: 'Toughened Glass 6mm at 45 pcs — consider restocking',             resourceId: glassPanel._id,  resourceType: 'material', read: false },
    { userId: subAdmin1._id,    type: 'low_stock',        title: 'Low stock alert',       message: 'Acrylic Sheet 3mm Clear at 120 pcs — monitor usage',              resourceId: acrylicSheet._id,resourceType: 'material', read: false },
    { userId: admin2._id,       type: 'task_delayed',     title: 'Task overdue',          message: 'Acrylic task for Metro Hospital is past expected completion time', resourceId: o7._id,          resourceType: 'task',     read: false },
  ])
  console.log('✓ 17 notifications seeded')

  // ── Stock ledger deductions (for completed/invoiced orders) ───────────────
  console.log('Seeding stock ledger deductions...')
  await StockLedger.insertMany([
    { materialId: flexVinyl._id, orderId: o1._id,  type: 'DEDUCT',     qty: 200, balanceAfter: 850 - 200,           note: `Deducted for ${o1.orderNumber}`,  performedBy: admin1._id },
    { materialId: blackInk._id,  orderId: o1._id,  type: 'DEDUCT',     qty: 500, balanceAfter: 12000 - 500,         note: `Deducted for ${o1.orderNumber}`,  performedBy: admin1._id },
    { materialId: backlit._id,   orderId: o15._id, type: 'DEDUCT',     qty: 100, balanceAfter: 420 - 100,           note: `Deducted for ${o15.orderNumber}`, performedBy: admin2._id },
    { materialId: flexVinyl._id,                   type: 'RESTOCK',    qty: 200, balanceAfter: 850 - 200 + 200,     note: 'Emergency restock from VinylPro', performedBy: admin1._id },
    { materialId: blackInk._id,                    type: 'ADJUSTMENT', qty: 200, balanceAfter: 12000 - 500 + 200,   note: 'Ink calibration adjustment',      performedBy: superAdmin._id },
  ])
  console.log('✓ 5 stock ledger entries seeded')

  // ── Barcodes ──────────────────────────────────────────────────────────────
  console.log('Seeding barcodes...')
  await Barcode.insertMany([
    { orderId: o1._id,  type: 'initial', code: `POMS-${o1.orderNumber}-INIT`,  qrDataUrl: await qr(`${o1.orderNumber}|initial`),  createdAt: ago(11) },
    { orderId: o1._id,  type: 'final',   code: `POMS-${o1.orderNumber}-FINAL`, qrDataUrl: await qr(`${o1.orderNumber}|final`),    createdAt: ago(5)  },
    { orderId: o2._id,  type: 'initial', code: `POMS-${o2.orderNumber}-INIT`,  qrDataUrl: await qr(`${o2.orderNumber}|initial`),  createdAt: ago(8)  },
    { orderId: o13._id, type: 'initial', code: `POMS-${o13.orderNumber}-INIT`, qrDataUrl: await qr(`${o13.orderNumber}|initial`), createdAt: ago(14) },
    { orderId: o13._id, type: 'final',   code: `POMS-${o13.orderNumber}-FINAL`,qrDataUrl: await qr(`${o13.orderNumber}|final`),   createdAt: ago(6)  },
    { orderId: o15._id, type: 'initial', code: `POMS-${o15.orderNumber}-INIT`, qrDataUrl: await qr(`${o15.orderNumber}|initial`), createdAt: ago(19) },
    { orderId: o15._id, type: 'final',   code: `POMS-${o15.orderNumber}-FINAL`,qrDataUrl: await qr(`${o15.orderNumber}|final`),   createdAt: ago(12) },
  ])
  console.log('✓ 7 barcodes seeded')

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log('\n✅ Demo seed complete!\n')
  console.log('Orders by status:')
  console.log('  draft × 3  | confirmed × 2 | designing × 2 | in_production × 2')
  console.log('  finishing × 1 | completed × 2 | invoiced × 2 | cancelled × 1')
  console.log('\nLogin credentials (all staff password: Staff@1234):')
  console.log('  super_admin  admin@poms.dev')
  console.log('  admin        rahul.admin@poms.dev   priya.admin@poms.dev')
  console.log('  sub_admin    arjun.sub@poms.dev     kavya.sub@poms.dev')
  console.log('  designer     aditya.design@poms.dev sneha.design@poms.dev')
  console.log('  flex staff   ravi.flex@poms.dev     mohan.flex@poms.dev')
  console.log('  screen staff suresh.screen@poms.dev ganesh.screen@poms.dev')
  console.log('  laser staff  nikhil.laser@poms.dev  rohit.laser@poms.dev')
  console.log('  acrylic      ashok.acrylic@poms.dev vinod.acrylic@poms.dev')
  console.log('  glass        harish.glass@poms.dev  sunil.glass@poms.dev')
  console.log('  (+ binder, offset, helper, expose, cutting — same pattern)\n')

  await mongoose.disconnect()
}

main().catch(err => { console.error(err); process.exit(1) })
