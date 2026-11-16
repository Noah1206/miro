import { PUBLIC_BUCKET, mediaType, readMedia } from '@/lib/storage/media'

const WIDTHS = new Set(['96', '192', '320', '640', '720', '1080'])   // components/character-visual 의 IMAGE_WIDTHS · next.config images
const HEADERS = { 'cache-control': 'public, max-age=31536000, immutable', 'x-content-type-options': 'nosniff' }

/**
 * 11/16 공개 사진 — 서버 디스크에서 내보낸다. 파일은 올린 뒤 바뀌지 않으므로 1년 캐시.
 * ?w=<폭> 이면 줄인 WebP — Next 이미지 변환(/_next/image, 디스크 캐시)에 맡기고, 주소가 사진 확장자로 끝나 Cloudflare 가 캐시한다
 * (/_next/image 주소는 Cloudflare 가 캐시하지 않아 방문자마다 이 서버까지 왔다 — 처음 줄이는 데 1~3초, 그동안 카드가 검게 보였다).
 */
export async function GET(req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const name = (await params).path.join('/'), type = mediaType(name)
  const width = new URL(req.url).searchParams.get('w')
  if (type && width && WIDTHS.has(width) && type !== 'image/webp' && type !== 'image/gif') {
    try {
      const source = `/media/${PUBLIC_BUCKET}/${name.split('/').map(encodeURIComponent).join('/')}`
      const resized = await fetch(`http://127.0.0.1:${process.env.PORT ?? 3100}/_next/image?url=${encodeURIComponent(source)}&w=${width}&q=80`,
        { headers: { accept: 'image/webp' }, signal: AbortSignal.timeout(20_000) })
      const resizedType = resized.headers.get('content-type')
      if (resized.ok && resizedType?.startsWith('image/')) return new Response(resized.body, { headers: { ...HEADERS, 'content-type': resizedType } })
    } catch { /* 변환 실패 — 아래에서 원본을 준다 */ }
  }
  const bytes = type ? await readMedia(PUBLIC_BUCKET, name) : null
  if (!bytes || !type) return new Response(null, { status: 404, headers: { 'cache-control': 'public, max-age=60' } })
  return new Response(new Uint8Array(bytes), { headers: { ...HEADERS, 'content-type': type, 'content-length': String(bytes.length) } })
}
