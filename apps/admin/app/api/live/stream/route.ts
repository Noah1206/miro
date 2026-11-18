import { currentAdmin } from '@/lib/auth'
import { events, fetchPresence, kpis, people, type LiveEvent } from '@/lib/live'

export const dynamic = 'force-dynamic'

const TICK_MS = 3000

/**
 * 실시간 현황 스트림(SSE). 접속하면 최근 24시간 활동 200개를 먼저 보내고, 3초마다 지금 접속 중인 사람·오늘 수치·새 활동을 보낸다.
 * 끊기면 브라우저 EventSource 가 스스로 다시 붙는다(화면이 상태를 보여 준다).
 * ponytail: 서버가 3초마다 DB 를 읽는 방식(관리자 한두 명 기준). 보는 사람이 많아지면 Postgres LISTEN/NOTIFY 로 밀어 주기.
 */
export async function GET(req: Request) {
  if (!await currentAdmin()) return new Response('unauthorized', { status: 401 })
  const enc = new TextEncoder()
  // 창을 닫으면 반복을 멈춘다 — 요청 취소·스트림 취소·쓰기 실패 중 무엇으로 알게 되든(멈추지 않으면 DB 를 계속 읽는다).
  let closed = false
  req.signal.addEventListener('abort', () => { closed = true })
  const stream = new ReadableStream({
    cancel() { closed = true },
    async start(ctrl) {
      const push = (type: string, data: unknown) => {
        if (closed) return
        try { ctrl.enqueue(enc.encode(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`)) } catch { closed = true }
      }
      // 같은 활동을 두 번 보내지 않는다 — 마지막 시각부터 다시 읽고, 이미 보낸 id 는 거른다.
      const sent = new Set<string>()
      let since = new Date(Date.now() - 24 * 3600_000), recent: LiveEvent[] = []
      const fresh = (list: LiveEvent[]) => list.filter(e => !sent.has(e.id) && sent.add(e.id))
      try {
        recent = await events({ since, limit: 200 })
        push('events', fresh(recent))
        if (recent[0]) since = new Date(recent[0].at)
      } catch (e) { push('problem', { message: (e as Error).message.slice(0, 200) }) }
      while (!closed) {
        try {
          const added = fresh(await events({ since, limit: 500 }))
          if (added.length) { push('events', added); since = new Date(added[0]!.at); recent = [...added, ...recent].slice(0, 500) }
          if (sent.size > 5000) { sent.clear(); for (const e of recent) sent.add(e.id) }
          const presence = await fetchPresence()
          const list = presence ? await people(presence.people, recent) : []
          const online = list.filter(p => p.status === 'online').length
          push('snapshot', { at: Date.now(), presenceOk: !!presence, people: list, kpi: await kpis(online, list.filter(p => p.status !== 'offline').length) })
        } catch (e) { push('problem', { message: (e as Error).message.slice(0, 200) }) }
        await new Promise(r => setTimeout(r, TICK_MS))
      }
      try { ctrl.close() } catch {}
    },
  })
  return new Response(stream, { headers: { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache, no-transform', connection: 'keep-alive' } })
}
