'use client'
import { useRouter } from 'next/navigation'
import type { ReactNode } from 'react'

/** 이전 화면으로. 동의 게이트는 어디서든 들어올 수 있어 정해진 href 가 없다. */
export function BackButton({ className, label, children }: { className?: string; label?: string; children: ReactNode }) {
  const router = useRouter()
  return <button type="button" className={className} aria-label={label} onClick={() => router.back()}>{children}</button>
}
