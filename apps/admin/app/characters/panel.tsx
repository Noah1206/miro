'use client'
import { useActionState } from 'react'
import { setType, type TypeState } from './actions'

/** 한 캐릭터의 유형 전환. reality → chat 은 그 캐릭터의 대기 연락까지 정리하므로 메모를 남기게 한다. */
export function TypePanel({ characterId, current, sessions }: { characterId: string; current: 'chat' | 'reality'; sessions: number }) {
  const [state, action, pending] = useActionState(setType, { message: null, ok: false } satisfies TypeState)
  const next = current === 'reality' ? 'chat' : 'reality'
  return (
    <form action={action} style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 240 }}>
      <input type="hidden" name="characterId" value={characterId} />
      <input type="hidden" name="type" value={next} />
      {state.message && <p role="alert" data-type-result={state.ok ? 'ok' : 'fail'} style={{ fontSize: 12.5, margin: 0, color: state.ok ? '#8fd3a8' : '#E05A7A' }}>{state.message}</p>}
      <div style={{ display: 'flex', gap: 6 }}>
        <input name="note" placeholder={next === 'chat' && sessions > 0 ? `대화 ${sessions}건 영향 — 사유` : '메모'} style={{ flex: 1 }} />
        <button type="submit" disabled={pending} className={`btn ${next === 'chat' ? 'btn-danger' : ''}`} data-set-type={next}>
          {next === 'reality' ? '미로에 넣기' : '홈으로 되돌리기'}
        </button>
      </div>
    </form>
  )
}
