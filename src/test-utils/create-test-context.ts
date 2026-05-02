/**
 * Backend helper imported by frontend integration tests.
 *
 * All mongoose operations use the backend's own mongoose instance, which avoids
 * the two-instance problem that arises when frontend tests import mongoose
 * directly (different pnpm .pnpm directories → different module identities).
 */
import mongoose from 'mongoose'
import http from 'node:http'
import { app } from '../app'
import { User } from '../modules/auth/auth.model'

export interface TestContext {
  adminToken: string
  staffToken: string
  adminId: string
  staffId: string
  server: http.Server
  teardown: () => Promise<void>
}

export async function createTestContext(mongoUri: string, port: number): Promise<TestContext> {
  await mongoose.connect(mongoUri)

  const server = app.listen(port)
  const base = `http://localhost:${port}`

  // Seed users
  const admin = await User.create({
    name: 'Test Admin',
    email: 'admin@poms.test',
    password: 'Admin@1234',
    role: 'super_admin',
  })

  const staff = await User.create({
    name: 'Test Staff',
    email: 'staff@poms.test',
    password: 'Staff@1234',
    role: 'flex_printing_staff',
  })

  // Login both users
  const [adminRes, staffRes] = await Promise.all([
    fetch(`${base}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@poms.test', password: 'Admin@1234' }),
    }),
    fetch(`${base}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'staff@poms.test', password: 'Staff@1234' }),
    }),
  ])

  const { token: adminToken } = await adminRes.json() as { token: string }
  const { token: staffToken } = await staffRes.json() as { token: string }

  const teardown = async () => {
    await new Promise<void>((res, rej) => server.close(e => e ? rej(e) : res()))
    await mongoose.disconnect()
  }

  return {
    adminToken,
    staffToken,
    adminId: admin._id.toString(),
    staffId: staff._id.toString(),
    server,
    teardown,
  }
}
