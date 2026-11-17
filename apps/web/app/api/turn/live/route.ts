import { currentUser } from '@/lib/auth'
import { liveTurn } from '@/lib/simulation/live-turns'

export const runtime = 'nodejs'
export const maxDuration = 300

/**
 * 11/17 진행 중인 턴 이어 받기 — 답이 나오는 중에 새로고침한 화면이 부른다. 진행 중이 아니면 204.
 * NDJSON: blocks(보낸 말 + 지금까지 블록, 바뀔 때마다) → done(저장 끝, 화면이 저장본을 다시 불러온다).
 */
export async function GET(req: Request): Promise<Response> {
  const user = await currentUser()
  if (!user) return new Response(null, { status: 401 })
  const url = new URL(req.url)
  const live = liveTurn(url.searchParams.get('sessionId') ?? '', user.id, url.searchParams.get('mode') === 'messenger' ? 'messenger' : 'chat')
  if (!live) return new Response(null, { status: 204 })
  const encoder = new TextEncoder()
  let stop = () => {}
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: unknown) => { try { controller.enqueue(encoder.encode(JSON.stringify(event) + '\n')) } catch { stop() } }
      const push = () => {
        if (live.done) { send({ type: 'done' }); stop(); try { controller.close() } catch { /* 이미 닫혔다 */ } }
        else send({ type: 'blocks', input: live.input, blocks: live.blocks })
      }
      live.listeners.add(push)
      stop = () => { live.listeners.delete(push) }
      push()
    },
    cancel() { stop() },
  })
  return new Response(body, { headers: { 'content-type': 'application/x-ndjson; charset=utf-8', 'cache-control': 'no-store, no-transform', 'x-accel-buffering': 'no' } })
}
