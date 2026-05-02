import 'dotenv/config'
import mongoose from 'mongoose'
import { User } from '../src/modules/auth/auth.model'

const DEV_ADMIN = {
  name:     'Dev Admin',
  email:    'admin@poms.dev',
  password: 'Admin@1234',
  role:     'super_admin' as const,
}

async function main() {
  if (process.env.NODE_ENV === 'production') {
    console.error('Refusing to run seed script in production')
    process.exit(1)
  }

  const uri = process.env.MONGODB_URI
  if (!uri) { console.error('MONGODB_URI not set'); process.exit(1) }

  await mongoose.connect(uri)

  const existing = await User.findOne({ email: DEV_ADMIN.email })
  if (existing) {
    console.log(`Already exists: ${DEV_ADMIN.email}`)
    await mongoose.disconnect()
    return
  }

  await User.create(DEV_ADMIN)
  console.log('✓ Dev admin seeded')
  console.log(`  Email:    ${DEV_ADMIN.email}`)
  console.log(`  Password: ${DEV_ADMIN.password}`)
  await mongoose.disconnect()
}

main().catch(err => { console.error(err); process.exit(1) })
