import { devApiAllowed } from '@miro/config'
import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db, characters } from '@miro/db'

const SLUG = /^[a-z0-9-]{1,40}$/

/**
 * 개발/E2E 전용 — 시드 캐릭터의 경험 유형을 바꾼다. 운영 콘솔의 지정을 테스트에서 대신하는 길이며,
 * 운영에서는 닫혀 있다. 알파 E2E 가 유진을 미로에 넣을 때 쓴다 — 알파 흐름의 '먼저 오는 메시지' 는
 * reality 캐릭터에만 열리기 때문이다. 운영 DB 의 유진은 이 라우트와 무관하게 chat 으로 남는다.
 */
export async function POST(req: Request) {
  if (!devApiAllowed()) return NextResponse.json({ error: 'not found' }, { status: 404 })
  const { slug, type } = (await req.json().catch(() => ({}))) as { slug?: string; type?: string }
  if (typeof slug !== 'string' || !SLUG.test(slug)) return NextResponse.json({ error: 'bad slug' }, { status: 400 })
  if (type !== 'chat' && type !== 'reality') return NextResponse.json({ error: 'bad type' }, { status: 400 })
  const [row] = await db.update(characters).set({ experienceType: type }).where(eq(characters.slug, slug)).returning({ id: characters.id })
  if (!row) return NextResponse.json({ error: 'unknown character' }, { status: 404 })
  return NextResponse.json({ ok: true, id: row.id, type })
}
