'use client'
import { useEffect } from 'react'
import { useToast } from '@/components/ui'

/** 개정 안내를 토스트로 — 탭을 연 뒤 첫 홈 방문에서만 띄운다(홈으로 돌아올 때마다 뜨지 않게). */
export function LegalRevisionToastView({ lines, href }: { lines: string[]; href: string }) {
  const toast = useToast()
  useEffect(() => {
    try { if (sessionStorage.getItem('legal-revision-toast')) return; sessionStorage.setItem('legal-revision-toast', '1') } catch { /* 저장소 막힘 — 그냥 띄운다 */ }
    for (const l of lines) toast(l, 'default', href)
  }, [lines, href, toast])
  return null
}
