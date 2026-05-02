import winston from 'winston'
import { env } from '../config/env'

const SENSITIVE_KEYS = ['password', 'token', 'secret', 'authorization', 'cookie', 'jwt']

function redactObject(obj: Record<string, unknown>): void {
  for (const key of Object.keys(obj)) {
    const lowerKey = key.toLowerCase()
    if (SENSITIVE_KEYS.some((sk) => lowerKey.includes(sk))) {
      obj[key] = '[REDACTED]'
    } else if (typeof obj[key] === 'object' && obj[key] !== null && !(obj[key] instanceof Date)) {
      redactObject(obj[key] as Record<string, unknown>)
    }
  }
}

const redactFormat = winston.format((info) => {
  redactObject(info as Record<string, unknown>)
  return info
})

export const logger = winston.createLogger({
  level: env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    redactFormat(),
    env.NODE_ENV === 'production'
      ? winston.format.json()
      : winston.format.combine(
          winston.format.colorize(),
          winston.format.printf(({ timestamp, level, message, ...meta }) => {
            const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : ''
            return `${timestamp} [${level}]: ${message}${metaStr}`
          })
        )
  ),
  transports: [new winston.transports.Console()],
})
