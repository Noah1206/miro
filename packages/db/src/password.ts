import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'

export function hashPassword(plain: string): string {
  const salt = randomBytes(16).toString('hex')
  return `${salt}:${scryptSync(plain, salt, 64).toString('hex')}`
}

export function verifyPassword(plain: string, stored: string): boolean {
  const [salt, hash] = stored.split(':')
  if (!salt || !hash) return false
  const expected = Buffer.from(hash, 'hex')
  const actual = scryptSync(plain, salt, 64)
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}
