import { devApiAllowed } from '@miro/config'
import { NextResponse } from 'next/server'
import { db, opsHeartbeats } from '@miro/db'
import { runRealityEvaluations, runRealityMaintenance, runRealityScheduler } from '@/lib/reality/scheduler'

/**
 * Vercel Cron 진입점. 앱이 닫혀 있어도 서버에서 돈다.
 * CRON_SECRET 없이는 호출할 수 없다.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get('authorization')
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  // 개발/E2E 에서만 판단 시각을 고정할 수 있다. 활동 시간·Quiet Hours 가 실시간에 묶이지 않게.
  const devApi = devApiAllowed()
  const override = devApi ? new URL(req.url).searchParams.get('now') : null
  const now = override && !Number.isNaN(Date.parse(override)) ? new Date(override) : new Date()
  const work = new URL(req.url).pathname.endsWith('/maintenance') ? 'maintenance' : new URL(req.url).searchParams.get('work')
  if (work && work !== 'maintenance' && work !== 'ai') return NextResponse.json({ error: 'invalid_work' }, { status: 400 })

  const run = work === 'maintenance' ? await runRealityMaintenance() : work === 'ai' ? await runRealityEvaluations(now) : await runRealityScheduler(now)
  console.info('[reality] scheduler run', JSON.stringify({ at: now.toISOString(), ...run }))
  // 끝난 시각을 남긴다 — /api/health 가 이게 오래되면 실패로 알린다(크론이 멈추면 크론이 보내는 경보도 멈추므로).
  const at = new Date()
  await db.insert(opsHeartbeats).values({ name: work ?? 'scheduler', at }).onConflictDoUpdate({ target: opsHeartbeats.name, set: { at } }).catch(() => {})
  return NextResponse.json(run)
}
