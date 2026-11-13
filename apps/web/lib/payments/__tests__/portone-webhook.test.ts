import { createHmac } from 'node:crypto'
import { expect, test } from 'vitest'
import { verifyPortOneWebhook } from '../portone-card'

const secret = 'whsec_' + Buffer.from('test-secret-key-0123456789').toString('base64')
const sign = (id: string, ts: string, body: string) =>
  'v1,' + createHmac('sha256', Buffer.from(secret.slice(6), 'base64')).update(`${id}.${ts}.${body}`).digest('base64')

test('accepts a correctly signed, fresh webhook and rejects tampering or replays', () => {
  const now = 1_800_000_000_000, ts = String(now / 1000), id = 'msg_1'
  const body = JSON.stringify({ type: 'Transaction.Paid', data: { paymentId: 'rc-1' } })
  expect(verifyPortOneWebhook(body, { id, timestamp: ts, signature: `v1,AAAA ${sign(id, ts, body)}` }, secret, now)?.type).toBe('Transaction.Paid')
  expect(verifyPortOneWebhook(body.replace('rc-1', 'rc-2'), { id, timestamp: ts, signature: sign(id, ts, body) }, secret, now)).toBeNull()
  expect(verifyPortOneWebhook(body, { id, timestamp: ts, signature: sign(id, ts, body) }, secret, now + 10 * 60_000)).toBeNull()
  expect(verifyPortOneWebhook(body, { id, timestamp: ts, signature: null }, secret, now)).toBeNull()
})
