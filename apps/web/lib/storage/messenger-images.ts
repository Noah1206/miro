import { createClient } from '@supabase/supabase-js'

export const MESSENGER_IMAGE_BUCKET = 'messenger-images'
export function messengerStorage() {
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('messenger_image_storage_unavailable')
  return createClient(url, key, { auth: { persistSession: false } })
}

/** 11/11 그림·가림 서버가 PNG 대신 WebP 를 준다(예전 PNG 도 받는다) — 바이트 머리로 형식을 골라 data URL 로. */
export function imageDataUrl(bytes: Buffer): string {
  const mime = bytes.subarray(0, 4).toString('latin1') === 'RIFF' && bytes.subarray(8, 12).toString('latin1') === 'WEBP' ? 'image/webp'
    : bytes[0] === 0xff && bytes[1] === 0xd8 ? 'image/jpeg' : 'image/png'
  return `data:${mime};base64,${bytes.toString('base64')}`
}

/** Personalized photos are private; only the owner-checked route can issue short-lived access. */
export async function saveMessengerImage(sessionId: string, assetId: string, dataUrl: string) {
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl)
  if (!match) throw new Error('messenger_image_invalid')
  const bytes = Buffer.from(match[2]!, 'base64')
  if (!bytes.length || bytes.length > 8 * 1024 * 1024) throw new Error('messenger_image_size')
  const client = messengerStorage()
  const bucket = await client.storage.getBucket(MESSENGER_IMAGE_BUCKET)
  if (bucket.data?.public) throw new Error('messenger_image_bucket_must_be_private')
  if (bucket.error) {
    if (String(bucket.error.statusCode) !== '404') throw new Error('messenger_image_bucket_unavailable')
    const created = await client.storage.createBucket(MESSENGER_IMAGE_BUCKET, {
      public: false, fileSizeLimit: 8 * 1024 * 1024, allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
    })
    if (created.error && String(created.error.statusCode) !== '409') throw new Error('messenger_image_bucket_unavailable')
    const checked = await client.storage.getBucket(MESSENGER_IMAGE_BUCKET)
    if (checked.error || checked.data?.public !== false) throw new Error('messenger_image_bucket_unavailable')
  }
  const path = `${sessionId}/${assetId}.${match[1] === 'image/jpeg' ? 'jpg' : match[1]!.split('/')[1]}`
  const result = await client.storage.from(MESSENGER_IMAGE_BUCKET).upload(path, bytes, { contentType: match[1], upsert: false })
  if (result.error) throw new Error('messenger_image_upload_failed')
  return { bucket: MESSENGER_IMAGE_BUCKET, path }
}

/** Only application's own public character portraits may become model references. */
export async function portraitReference(url: string | undefined) {
  if (!url || !process.env.SUPABASE_URL) return null
  const target = new URL(url), trusted = new URL(process.env.SUPABASE_URL)
  if (target.origin !== trusted.origin || target.protocol !== 'https:' || target.username || target.password
    || !target.pathname.startsWith('/storage/v1/object/public/character-images/')) return null
  const response = await fetch(target, { signal: AbortSignal.timeout(10_000), redirect: 'error' })
  const mimeType = response.headers.get('content-type')?.split(';')[0]
  if (!response.ok || !mimeType || !['image/jpeg', 'image/png', 'image/webp'].includes(mimeType)) return null
  const reader = response.body?.getReader()
  if (!reader) return null
  const chunks: Uint8Array[] = []; let size = 0
  try {
    for (;;) {
      const { done, value } = await reader.read(); if (done) break
      size += value.byteLength
      if (size > 4 * 1024 * 1024) { await reader.cancel(); return null }
      chunks.push(value)
    }
  } finally { reader.releaseLock() }
  return size ? { mimeType, data: Buffer.concat(chunks).toString('base64') } : null
}
