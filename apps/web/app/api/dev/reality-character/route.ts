import { devApiAllowed } from '@miro/config'
import { NextResponse } from 'next/server'
import { currentUser } from '@/lib/auth'
import { cloneCharacterAsReality } from '@/lib/dev/reality-clone'

const SLUG = /^[a-z0-9-]{1,40}$/

/**
 * 개발/E2E 전용 — 시드 캐릭터를 내 소유의 미로(reality) 캐릭터로 복제한다.
 * 운영에서는 닫혀 있다. 시드 자체는 chat 으로 두어야 하므로 유형을 바꾸지 않고 복제한다.
 */
export async function POST(req: Request) {
  if (!devApiAllowed()) return NextResponse.json({ error: 'not found' }, { status: 404 })
  const user = await currentUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { slug } = (await req.json().catch(() => ({}))) as { slug?: string }
  if (typeof slug !== 'string' || !SLUG.test(slug)) return NextResponse.json({ error: 'bad slug' }, { status: 400 })
  const c = await cloneCharacterAsReality(slug, { ownerId: user.id })
  return NextResponse.json({ ok: true, id: c.id })
}
