import dotenv from 'dotenv'
import { z } from 'zod'

dotenv.config()

const envSchema = z.object({
  NODE_ENV:          z.enum(['development', 'production', 'test']).default('development'),
  PORT:              z.string().default('5000'),
  MONGODB_URI:       z.string().min(1, 'MONGODB_URI is required'),
  JWT_SECRET:        z.string().min(16, 'JWT_SECRET must be at least 16 chars'),
  JWT_EXPIRES_IN:    z.string().default('8h'),
  RAW_BILL_PASSWORD: z.string().min(1, 'RAW_BILL_PASSWORD is required'),
  SHOP_GSTIN:        z.string().default(''),
  SHOP_NAME:         z.string().default(''),
  AWS_ACCESS_KEY_ID:     z.string().default(''),
  AWS_SECRET_ACCESS_KEY: z.string().default(''),
  AWS_REGION:        z.string().default('ap-south-1'),
  AWS_S3_BUCKET:     z.string().default('poms-files'),
})

const parsed = envSchema.safeParse(process.env)

if (!parsed.success) {
  console.error('Invalid environment variables:', parsed.error.flatten().fieldErrors)
  process.exit(1)
}

export const env = parsed.data
