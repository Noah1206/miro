'use client'
import { Button, useLoginSheet } from '@/components/ui'

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
