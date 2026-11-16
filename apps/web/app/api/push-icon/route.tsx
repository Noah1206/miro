import { ImageResponse } from 'next/og'
import { PUBLIC_BUCKET, mediaType, publicMediaName, readMedia } from '@/lib/storage/media'

/**
 * 11/10 알림 아이콘 — 캐릭터 프로필 사진을 192px 로 다듬는다. shape=talk 이면 카톡 프로필처럼 둥근 사각형, 아니면 동그라미.
 * 서비스 워커(public/sw.js)가 그 방의 채팅 테마를 보고 shape 를 고른다. 우리 저장소 사진만 받는다(아무 주소나 대신 받아 주는 통로가 되지 않게).
 */
const SIZE = 192
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams
  // 11/16 사진은 우리 서버의 /media/character-images/… — 상대 주소만 받고 디스크에서 읽는다.
  const name = publicMediaName(params.get('src') ?? ''), type = name ? mediaType(name) : null
  const bytes = name && type ? await readMedia(PUBLIC_BUCKET, name) : null
  if (!bytes) return new Response('bad src', { status: 400 })
  const src = `data:${type};base64,${bytes.toString('base64')}`
  const radius = params.get('shape') === 'talk' ? Math.round(SIZE * 0.38) : SIZE / 2
  return new ImageResponse(
    // eslint-disable-next-line @next/next/no-img-element
    <div style={{ width: SIZE, height: SIZE, display: 'flex' }}><img src={src} width={SIZE} height={SIZE} alt="" style={{ width: SIZE, height: SIZE, objectFit: 'cover', borderRadius: radius }} /></div>,
    { width: SIZE, height: SIZE, headers: { 'Cache-Control': 'public, max-age=86400, immutable' } },
  )
}
