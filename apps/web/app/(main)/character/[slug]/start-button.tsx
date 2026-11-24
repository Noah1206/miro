'use client'
import { Button, useLoginSheet } from '@/components/ui'
import { useUnveilEnable } from '@/components/unveil-unlock'
import { useFormStatus } from 'react-dom'
import { useEffect } from 'react'

/** 비로그인 상태의 대화 시작. 로그인 화면으로 보내지 않고 시트로 묻는다. */
export function StartWithLogin({ slug, label }: { slug: string; label: string }) {
  const askLogin = useLoginSheet()
  return (
    <Button type="button" variant="ghost" data-start-login full
      style={{ background: 'var(--color-white)', border: '0.5px solid var(--color-lavender-600)', color: 'var(--color-lavender-600)' }}
      onClick={() => askLogin(`/character/${slug}`)}>
      {label}
    </Button>
  )
}

/** 11/12 성인 전용 작품 + 언베일 꺼짐 — '대화하기'를 누르면 바로 본인인증(최초 1회)·언베일 켜기. 켜지면 새로고침되어 보통 시작 버튼으로 바뀐다. */
export function StartWithUnveil({ returnTo, label }: { returnTo: string; label: string }) {
  const { apply, pending, sheets } = useUnveilEnable({ signedIn: true, returnTo })
  return <>
    <Button type="button" variant="primary" full disabled={pending} onClick={() => apply(true)}
      style={{ background: 'var(--color-lavender-600)', border: '1px solid var(--color-lavender-600)', color: 'var(--color-white)', borderRadius: 'var(--radius-lg)' }}>
      {label}
    </Button>
    {sheets}
  </>
}

/**
 * 11/20 사용자: 이미 대화한 방이 있으면 '이어서 대화'(그 방으로)와 '새로 대화'(지금 방은 대화 목록에 남기고 새 방) 두 버튼.
 * 시작 폼(start-roleplay) 안에 둔다 — 새로 대화는 fresh=1 을 함께 보낸다. 누른 쪽에만 도는 표시.
 */
export function ResumeOrNew({ resume, fresh }: { resume: string; fresh: string }) {
  const { pending, data } = useFormStatus()
  const isFresh = data?.get('fresh') === '1'
  const base = { flex: 1, minWidth: 0, borderRadius: 'var(--radius-lg)', fontWeight: 'var(--weight-semibold)' } as const
  return <div style={{ display: 'flex', gap: 8 }}>
    <SubmitNavigates />
    <Button type="submit" full status={pending && !isFresh ? 'loading' : 'idle'} disabled={pending}
      style={{ ...base, background: 'var(--color-lavender-600)', border: '1px solid var(--color-lavender-600)', color: 'var(--color-white)' }}>{resume}</Button>
    <Button type="submit" name="fresh" value="1" full status={pending && isFresh ? 'loading' : 'idle'} disabled={pending}
      style={{ ...base, background: '#f3f3f3', border: '1px solid #f3f3f3', color: '#1c1c1c' }}>{fresh}</Button>
  </div>
}

/**
 * 11/21 사용자: 대화 시작·이어서 대화를 누르면 버튼 안에서만 돌던 표시 대신, 다른 화면 이동과 같은 로딩(화면 가운데 고리 + 맨 위 라벤더 막대).
 * 시작 폼(서버 액션)은 링크가 아니라 이동 신호가 없었다 — 보내는 중이 되면 같은 신호를 낸다. 대화방으로 넘어가면(주소가 바뀌면) 걷힌다.
 */
export function SubmitNavigates() {
  const { pending } = useFormStatus()
  useEffect(() => { if (pending) window.dispatchEvent(new CustomEvent('miro:route-start', { detail: '/chat' })) }, [pending])
  return null
}
