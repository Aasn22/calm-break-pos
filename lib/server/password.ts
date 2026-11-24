import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from 'node:crypto'
import { promisify } from 'node:util'
const scrypt = promisify(scryptCallback)
export async function hashPassword(password: string) {
  if (
    typeof password !== 'string' ||
    password.length < 12 ||
    password.length > 128
  )
    throw new Error('Passwords must contain 12–128 characters.')
  const salt = randomBytes(16).toString('hex')
  const hash = (await scrypt(password, salt, 64)) as Buffer
  return `${salt}:${hash.toString('hex')}`
}
export async function verifyPassword(password: string, stored: string) {
  if (typeof password !== 'string' || password.length > 128) return false
  const [salt, hash] = stored.split(':')
  if (!salt || !hash) return false
  const candidate = (await scrypt(password, salt, 64)) as Buffer
  const expected = Buffer.from(hash, 'hex')
  return (
    expected.length === candidate.length && timingSafeEqual(expected, candidate)
  )
}
