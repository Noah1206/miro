import { devApiAllowed } from '@miro/config'
import { NextResponse } from 'next/server'
import { and, desc, eq, gt } from 'drizzle-orm'
import { db, usageWindows } from '@miro/db'
import { currentUser } from '@/lib/auth'
import { reserve } from '@/lib/usage/guard'

/** 개발/E2E 전용. 현재 창의 사용량을 한도까지 채워 한도 도달 UX 를 재현한다. */
export async function POST() {
  if (!devApiAllowed()) {
    return NextResponse.json({ error: 'not found' }, { status: 404 })
  }
  const user = await currentUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  // Open the monthly window with zero units; exhausting it must never debit signup/purchased tokens.
  await reserve({ userId: user.id, kind: 'textRP', units: 0, idempotencyKey: `dev:${user.id}:${Date.now()}` })
  const [win] = await db.select().from(usageWindows)
    .where(and(eq(usageWindows.userId, user.id), gt(usageWindows.endsAt, new Date())))
    .orderBy(desc(usageWindows.startedAt)).limit(1)
  await db.update(usageWindows).set({ consumed: win!.limit }).where(eq(usageWindows.id, win!.id))
  return NextResponse.json({ ok: true, limit: win!.limit })
}
