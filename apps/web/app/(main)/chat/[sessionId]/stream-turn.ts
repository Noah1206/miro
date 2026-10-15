import type { TurnState } from '@/lib/simulation/turn-action'
import type { LiveTurn } from './turns'

/**
 * 한 턴(캐릭터챗·문자, 폼의 mode)을 /api/turn 으로 보내고 답을 받는 대로 onLive 로 넘긴다(10/9 스트리밍). 끝에 저장된 결과(TurnState)를 돌려준다 — 서버 액션과 같은 모양.
 * 줄이 끝까지 오지 않으면(연결 끊김) 던진다 — 부른 쪽이 같은 requestId 로 다시 보내게 한다.
 */
export async function streamTurn(form: FormData, onLive: (live: LiveTurn | null) => void): Promise<TurnState> {
  const input = String(form.get('input') ?? '').trim()
  const requestId = String(form.get('requestId') ?? '') || 'live'
  // Transport recovery reuses requestId for server deduplication, but the new
  // visual playback must not inherit a failed stream's already-seen rows.
  const playback = `${requestId}:${crypto.randomUUID()}`
  let attempt = 0
  const live = (blocks: LiveTurn['blocks']): LiveTurn => ({ input, blocks, playbackId: `${playback}:${attempt}` })
  // 액션 안에서 첫 await 전의 상태 변경은 액션이 끝날 때까지 미뤄진다 — 한 박자 넘겨 보낸 말이 바로 보이게.
  await Promise.resolve()
  if (input) onLive(live([]))
  const res = await fetch('/api/turn', { method: 'POST', body: form })
  if (!res.ok || !res.body) throw new Error('stream_failed')
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader()
  let buffer = ''
  for (;;) {
    const { value, done: ended } = await reader.read()
    if (ended) break
    buffer += value
    for (let nl = buffer.indexOf('\n'); nl >= 0; nl = buffer.indexOf('\n')) {
      const line = buffer.slice(0, nl); buffer = buffer.slice(nl + 1)
      if (!line.trim()) continue
      const event = JSON.parse(line) as { type: 'blocks'; blocks: LiveTurn['blocks'] } | { type: 'reset' } | { type: 'done'; state: TurnState }
      if (event.type === 'blocks') onLive(live(event.blocks))
      else if (event.type === 'reset') { attempt++; onLive(live([])) }
      else {
        // The persisted result completes a turn. A proxy may keep the transport open afterwards.
        void reader.cancel().catch(() => {})
        return event.state
      }
    }
  }
  throw new Error('stream_incomplete')
}

