import { devApiAllowed } from '@miro/config'
import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db, userPersonas } from '@miro/db'
import { currentUser } from '@/lib/auth'
import { savePersona } from '@/lib/persona'

/**
 * 개발/E2E 전용 — 로그인한 사용자의 페르소나를 만든다. 채팅·문자 화면은 페르소나가 없으면 페르소나 화면으로 보내므로,
 * 그 흐름을 시험하지 않는 테스트는 가입 직후 여기서 만든다(e2e/helpers signUp). 운영에서는 닫혀 있다.
 */
export async function POST(req: Request) {
  if (!devApiAllowed()) return NextResponse.json({ error: 'not found' }, { status: 404 })
  const user = await currentUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const result = await savePersona(user.id, { name: body.name ?? '테스터', gender: body.gender, description: body.description })
  return result.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: result.error }, { status: 400 })
}

/** 개발/E2E 전용 — 페르소나를 지운다. 온보딩이 닉네임으로 페르소나를 만들기 때문에, 페르소나 관문을 시험할 때 지운다. */
export async function DELETE() {
  if (!devApiAllowed()) return NextResponse.json({ error: 'not found' }, { status: 404 })
  const user = await currentUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  await db.delete(userPersonas).where(eq(userPersonas.userId, user.id))
  return NextResponse.json({ ok: true })
}
