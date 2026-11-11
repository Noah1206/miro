'use client'
import { Button, useLoginSheet } from '@/components/ui'
import { useUnveilEnable } from '@/components/unveil-unlock'

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
