import 'dotenv/config'
import mongoose from 'mongoose'
import { User } from '../src/modules/auth/auth.model'

async function main() {
  if (process.env.NODE_ENV === 'production') {
    console.error('Refusing to run seed script in production')
    process.exit(1)
  }

  const uri = process.env.MONGODB_URI
  if (!uri) {
    console.error('MONGODB_URI not set in .env')
    process.exit(1)
  }

  const [, , name, email, password] = process.argv
  if (!name || !email || !password) {
    console.error('Usage: pnpm seed <name> <email> <password>')
    process.exit(1)
  }
  if (password.length < 8) {
    console.error('Password must be at least 8 characters')
    process.exit(1)
  }

  await mongoose.connect(uri)
  console.log('Connected to MongoDB')

  const existing = await User.findOne({ role: 'super_admin' })
  if (existing) {
    console.log(`super_admin already exists: ${existing.email}`)
    await mongoose.disconnect()
    return
  }

  await User.create({ name, email, password, role: 'super_admin' })
  console.log(`✓ super_admin created: ${email}`)
  await mongoose.disconnect()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
