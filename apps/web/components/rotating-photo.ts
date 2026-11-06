'use client'
import { useEffect, useState } from 'react'
import { useReducedMotion } from 'motion/react'
import { isUnveilPhoto } from '@/lib/unveil-photo'

/**
 * 11/6: 홈·탐색 카드의 사진이 3.5초마다 저절로 다음 장으로(상세 대표 사진과 같은 간격).
 * 언베일 사진(unveil-…)은 언베일을 켠 사람(veiled === false)에게만 돌린다 — 카드엔 사진별 흐림이 없어서다.
 * 카드마다 시작을 조금씩 어긋나게 해 한꺼번에 바뀌지 않게 한다.
 */
export function useRotatingPhoto(images: string[], veiled?: boolean): { photos: string[]; active: number; photo: string | null } {
  const photos = veiled === false ? images : images.filter(src => !isUnveilPhoto(src))
  const [i, setI] = useState(0)
  const reduce = useReducedMotion()
  const n = photos.length
  useEffect(() => {
    if (reduce || n < 2) return
    let id: ReturnType<typeof setInterval> | undefined
    const start = setTimeout(() => { id = setInterval(() => setI(v => (v + 1) % n), 3500) }, Math.random() * 1500)
    return () => { clearTimeout(start); clearInterval(id) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduce, n])
  const active = i % Math.max(n, 1)
  return { photos, active, photo: photos[active] ?? images[0] ?? null }
}
