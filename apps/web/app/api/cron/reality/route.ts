import { NextResponse } from 'next/server'
import { runRealityScheduler } from '@/lib/reality/scheduler'

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
  const devApi = process.env.NODE_ENV !== 'production' || process.env.MIRO_ENABLE_DEV_API === '1'
  const override = devApi ? new URL(req.url).searchParams.get('now') : null
  const now = override && !Number.isNaN(Date.parse(override)) ? new Date(override) : new Date()

  const run = await runRealityScheduler(now)
  console.info('[reality] scheduler run', JSON.stringify({ at: now.toISOString(), ...run }))
  return NextResponse.json(run)
}
