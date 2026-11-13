'use client'
import { useEffect, useState } from 'react'

/** 11/13 베이비챗식: 브라우저에서만 그린다 — 서버 HTML(검색엔진이 읽는 글)에서 빼야 하는 부분용. */
export function AfterMount({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  return mounted ? children : null
}
