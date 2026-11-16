import { PUBLIC_BUCKET, mediaType, readMedia } from '@/lib/storage/media'

/** 11/16 공개 사진 — 서버 디스크에서 내보낸다. 파일은 올린 뒤 바뀌지 않으므로 1년 캐시(Cloudflare 가 대신 내보낸다). */
export async function GET(_req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const name = (await params).path.join('/'), type = mediaType(name)
  const bytes = type ? await readMedia(PUBLIC_BUCKET, name) : null
  if (!bytes || !type) return new Response(null, { status: 404, headers: { 'cache-control': 'public, max-age=60' } })
  return new Response(new Uint8Array(bytes), { headers: { 'content-type': type, 'content-length': String(bytes.length),
    'cache-control': 'public, max-age=31536000, immutable', 'x-content-type-options': 'nosniff' } })
}
