import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db, users } from '@miro/db'
import { currentUser } from '@/lib/auth'

/** 개발/E2E 전용 Pro 토글. P13(결제) 전까지 자격 전환 수단. 운영에서는 닫혀 있다. */
export async function POST(req: Request) {
  if (process.env.NODE_ENV === 'production' && process.env.MIRO_ENABLE_DEV_API !== '1') {
    return NextResponse.json({ error: 'not found' }, { status: 404 })
  }
  const user = await currentUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { plan } = (await req.json().catch(() => ({}))) as { plan?: string }
  if (plan !== 'free' && plan !== 'pro') return NextResponse.json({ error: 'bad plan' }, { status: 400 })
  await db.update(users).set({ plan }).where(eq(users.id, user.id))
  return NextResponse.json({ ok: true, plan })
}
