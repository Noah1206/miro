'use client'
import { useActionState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Button, ButtonLink } from '@/components/ui'
import { tween } from '@/lib/motion/tokens'
import { requestPhoto, type MediaState } from './media-actions'
import { placeCallAction, type PlaceCallState } from '@/app/(immersive)/call/[callId]/actions'

export type MediaBarFeatures = { photo: boolean; live: boolean; voice: boolean; video: boolean }

/** 장면을 넓히는 문들. 조용한 보조 버튼 — 텍스트가 주인공이다. 기능 플래그로 꺼진 문은 보이지 않는다. */
export function MediaBar({ sessionId, matureAllowed, enabled }: { sessionId: string; matureAllowed: boolean; enabled: MediaBarFeatures }) {
  const [state, action, pending] = useActionState(requestPhoto, { error: null, notice: null } satisfies MediaState)
  const [callState, callAction, calling] = useActionState(placeCallAction, { error: null } satisfies PlaceCallState)
  const err = callState.error ?? state.error
  if (!enabled.photo && !enabled.live && !enabled.voice && !enabled.video) return null
  return (
    <div style={{ padding: '0 var(--space-4) 8px' }}>
      <AnimatePresence initial={false}>
        {err && <motion.p key="e" role="alert" className="t-caption" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={tween.fast} style={{ color: 'var(--color-danger)', marginBottom: 6 }}>{err}</motion.p>}
        {state.notice && <motion.p key="n" role="status" className="t-caption" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ color: 'var(--color-text-tertiary)', marginBottom: 6 }}>⚠ {state.notice}</motion.p>}
      </AnimatePresence>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        {enabled.photo && <form action={action} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input type="hidden" name="sessionId" value={sessionId} />
          <Button type="submit" size="sm" variant="secondary" status={pending ? 'loading' : 'idle'}>{pending ? '사진 요청 중' : '사진'}</Button>
          {matureAllowed && <label className="t-micro" style={{ display: 'flex', gap: 5, alignItems: 'center', textTransform: 'none', letterSpacing: 0 }}><input type="checkbox" name="mature" style={{ accentColor: 'var(--color-white)' }} />성인</label>}
        </form>}
        {enabled.live && <ButtonLink href={`/live/${sessionId}`} size="sm" variant="secondary"><span lang="en">Live Scene</span></ButtonLink>}
        {(['voice', 'video'] as const).filter((ch) => enabled[ch]).map((ch) => (
          <form key={ch} action={callAction}>
            <input type="hidden" name="sessionId" value={sessionId} /><input type="hidden" name="channel" value={ch} />
            <Button type="submit" size="sm" variant="secondary" disabled={calling}>{ch === 'voice' ? '통화' : '영상통화'}</Button>
          </form>
        ))}
      </div>
    </div>
  )
}
