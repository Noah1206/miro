'use client'
import { Button, useLoginSheet } from '@/components/ui'

/** 비로그인 상태의 대화 시작. 로그인 화면으로 보내지 않고 시트로 묻는다. */
export function StartWithLogin({ slug, label }: { slug: string; label: string }) {
  const askLogin = useLoginSheet()
  return (
    <Button type="button" variant="ghost" data-start-login full
      style={{ background: 'rgba(184, 166, 255, 0.10)', border: '0.5px solid rgba(184, 166, 255, 0.5)', borderRadius: 999, color: 'var(--color-text-primary)' }}
      onClick={() => askLogin(`/character/${slug}`)}>
      {label}
    </Button>
  )
}
