import { currentUser } from '@/lib/auth'
import { turnFromForm, type TurnState } from '@/lib/simulation/turn-action'
import { msg } from '@/lib/i18n'
import { and, eq } from 'drizzle-orm'
import { db, roleplaySessions } from '@miro/db'
import { feature } from '@miro/config'
import { resolveTts } from '@miro/providers'

export const runtime = 'nodejs'
export const maxDuration = 300

/**
 * 캐릭터챗·문자 한 턴을 스트리밍으로(10/9) — 서버 액션은 한 번에 하나만 돌려줄 수 있어 대사를 받는 대로 보내려면 이 경로가 필요하다.
 * 줄마다 JSON 하나(NDJSON): blocks(지금까지 다 닫힌 블록 전체, 저장 전), reset(새 시도 — 보여 준 블록을 지운다), done(저장된 결과, 서버 액션과 같은 TurnState).
 * 파이프라인·멱등·한도·실패 문구는 서버 액션과 같은 turnFromForm 이다. 연결이 끊겨도 턴은 서버에서 끝까지 가고, 같은 requestId 로 다시 보내면 결과를 돌려받는다.
 */
export async function POST(req: Request): Promise<Response> {
  const user = await currentUser()
  if (!user) return new Response(null, { status: 401 })
  const form = await req.formData()
  const encoder = new TextEncoder()
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: unknown) => { try { controller.enqueue(encoder.encode(JSON.stringify(event) + '\n')) } catch { /* 받는 쪽이 떠났다 — 턴은 계속 간다 */ } }
      // 11/11 음성 모드가 켜진 채팅방이면 답을 쓰는 동안 합성 서버를 깨운다 — 한 턴 통째 합성은 저장 뒤 시작한다(사용자: 묶음이 아니라 1턴당).
      const sessionId = String(form.get('sessionId') ?? '')
      const room = form.get('voice') === '1' && form.get('mode') !== 'messenger' && feature('characterVoice') && /^[0-9a-f-]{36}$/i.test(sessionId)
        ? (await db.select({ id: roleplaySessions.id }).from(roleplaySessions)
          .where(and(eq(roleplaySessions.id, sessionId), eq(roleplaySessions.userId, user.id))).limit(1))[0] : undefined
      // 꺼져 있으면 켜지는 30초를 답 생성 시간 뒤에 숨긴다. 기다리지 않는다.
      if (room) void resolveTts()?.warm?.(AbortSignal.timeout(60_000)).catch(() => {})
      let state: TurnState
      try {
        // 문자방(10/9)도 같은 경로 — 문자 모드는 대사 블록만 오므로 말풍선이 하나씩 도착한다.
        const mode = form.get('mode') === 'messenger' ? 'messenger' as const : 'chat' as const
        state = await turnFromForm(user.id, form, { mode, path: (id) => mode === 'messenger' ? `/messages/${id}` : `/chat/${id}`,
          stream: { onBlocks: (blocks) => send({ type: 'blocks', blocks }), onReset: () => send({ type: 'reset' }) },
          // 리롤: 옛 턴을 되돌린 순간 알린다 — 화면이 옛 답을 지우고 새 답을 기다린다.
          onUndone: (ids) => send({ type: 'undone', ids }) })
      } catch {
        state = { error: msg('연결이 끊겼어요. 입력한 내용은 보관했어요. 다시 전송하면 처리 결과를 확인해요.'), notice: null, limit: null, retryWithSameId: true }
      }
      send({ type: 'done', state })
      try { controller.close() } catch { /* 이미 닫혔다 */ }
    },
  })
  return new Response(body, { headers: { 'content-type': 'application/x-ndjson; charset=utf-8', 'cache-control': 'no-store, no-transform', 'x-accel-buffering': 'no' } })
}
