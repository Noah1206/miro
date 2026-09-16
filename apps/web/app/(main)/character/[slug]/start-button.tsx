'use client'
import { Button, useLoginSheet } from '@/components/ui'

/** 비로그인 상태의 대화 시작. 로그인 화면으로 보내지 않고 시트로 묻는다. */
export function StartWithLogin({ slug, label }: { slug: string; label: string }) {
  const askLogin = useLoginSheet()
  return (
    <Button type="button" variant="primary" size="lg" data-start-login
      style={{ minHeight: 42, height: 42, padding: '8px 16px', fontSize: 14 }} full
      onClick={() => askLogin(`/character/${slug}`)}>
      {label}
    </Button>
  )
}
