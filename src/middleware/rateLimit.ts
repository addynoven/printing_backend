import rateLimit from 'express-rate-limit'

export function makeRateLimit({ max, message }: { max: number; message?: string }) {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    max,
    skip: () => process.env.NODE_ENV === 'test',
    standardHeaders: true,
    legacyHeaders: false,
    message: message ? { error: message } : undefined,
  })
}
