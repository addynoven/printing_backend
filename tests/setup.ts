import { beforeAll, afterAll, afterEach, vi } from 'vitest'
import { MongoMemoryReplSet } from 'mongodb-memory-server'
import mongoose from 'mongoose'

let mongoServer: MongoMemoryReplSet

beforeAll(async () => {
  mongoServer = await MongoMemoryReplSet.create({ replSet: { count: 1 } })
  await mongoose.connect(mongoServer.getUri())

  // Block real network calls in unit tests
  vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
    throw new Error('Real network call in unit test — use vi.mock()')
  })
}, 60_000)

afterEach(async () => {
  // Clean slate between tests
  const collections = mongoose.connection.collections
  for (const key in collections) {
    await collections[key].deleteMany({})
  }
  vi.clearAllMocks()
})

afterAll(async () => {
  await mongoose.disconnect()
  await mongoServer.stop()
  vi.restoreAllMocks()
}, 60_000)
