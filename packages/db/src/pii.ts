import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

/**
 * 고유식별정보(주민등록번호) 저장용 AES-256-GCM. 키는 MIRO_PII_KEY(32바이트 base64) — web(암호화)·admin(복호화) 둘 다 같은 값.
 * 저장 형식 'v1.<iv>.<tag>.<본문>'(모두 base64url).
 */
function key(): Buffer {
  const k = Buffer.from(process.env.MIRO_PII_KEY ?? '', 'base64')
  if (k.length !== 32) throw new Error('MIRO_PII_KEY 가 없거나 32바이트가 아닙니다')
  return k
}
export function sealPii(plain: string): string {
  const iv = randomBytes(12)
  const c = createCipheriv('aes-256-gcm', key(), iv)
  const body = Buffer.concat([c.update(plain, 'utf8'), c.final()])
  return ['v1', iv, c.getAuthTag(), body].map(x => typeof x === 'string' ? x : x.toString('base64url')).join('.')
}
export function openPii(sealed: string): string {
  const [v, iv, tag, body] = sealed.split('.')
  if (v !== 'v1' || !iv || !tag || !body) throw new Error('알 수 없는 암호문')
  const d = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64url'))
  d.setAuthTag(Buffer.from(tag, 'base64url'))
  return Buffer.concat([d.update(Buffer.from(body, 'base64url')), d.final()]).toString('utf8')
}
