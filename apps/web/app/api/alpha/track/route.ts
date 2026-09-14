import { NextResponse } from 'next/server'
import { isAnalyticsEvent } from '@miro/domain'
import { getAlphaSession } from '@/lib/alpha/session'
import { trackAlpha } from '@/lib/alpha/track'

/** 브라우저에서 보는 이벤트(landing_view, reality_message_seen). 알 수 없는 이름은 버린다. */
export async function POST(req: Request): Promise<Response> {
  const body = (await req.json().catch(() => null)) as { event?: unknown; props?: unknown } | null
  const event = typeof body?.event === 'string' ? body.event : ''
  if (!isAnalyticsEvent(event) || !event.match(/^(landing_view|reality_message_seen|waitlist_view)$/)) {
    return NextResponse.json({ ok: false }, { status: 400 })
  }
  const session = await getAlphaSession()
  trackAlpha(session?.userId ?? null, event, typeof body?.props === 'object' && body?.props ? (body.props as Record<string, unknown>) : {})
  return NextResponse.json({ ok: true })
}
