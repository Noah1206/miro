import { PUBLIC_BUCKET, publicMediaName, mediaType, readMedia, writeMedia } from './media'

export const MESSENGER_IMAGE_BUCKET = 'messenger-images'

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
  const path = `${sessionId}/${assetId}.${match[1] === 'image/jpeg' ? 'jpg' : match[1]!.split('/')[1]}`
  // 11/16 서버 디스크(lib/storage/media) — 공개 경로(/media)는 character-images 만 내보내므로 이 폴더는 본인 확인 경로로만 나간다.
  try { await writeMedia(MESSENGER_IMAGE_BUCKET, path, bytes) } catch { throw new Error('messenger_image_upload_failed') }
  return { bucket: MESSENGER_IMAGE_BUCKET, path }
}

/** Only application's own public character portraits may become model references. */
export async function portraitReference(url: string | undefined) {
  const name = url ? publicMediaName(url) : null, mimeType = name ? mediaType(name) : null
  if (!name || !mimeType || !['image/jpeg', 'image/png', 'image/webp'].includes(mimeType)) return null
  const bytes = await readMedia(PUBLIC_BUCKET, name)
  return bytes && bytes.length <= 4 * 1024 * 1024 ? { mimeType, data: bytes.toString('base64') } : null
}
