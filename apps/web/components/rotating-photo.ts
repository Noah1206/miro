'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useReducedMotion } from 'motion/react'
import { isUnveilPhoto } from '@/lib/unveil-photo'

/**
 * 11/6: 홈·탐색 카드의 사진이 저절로 다음 장으로(11/7 사용자: 2초 → 1초).
 * 언베일 사진(unveil-…)은 언베일을 켠 사람(veiled === false)에게만 돌린다 — 카드엔 사진별 흐림이 없어서다.
 * 카드마다 시작을 조금씩 어긋나게 해 한꺼번에 바뀌지 않게 한다.
 */
/** 11/7 사용자: 대표 사진이 넘어가지 않고 첫 장(표지)에 머무는 작품 — 카드와 상세 대표 사진 모두. */
const STILL_COVERS = new Set(['official-m-cheonma-reborn'])
export const stillCover = (slug?: string | null) => !!slug && STILL_COVERS.has(slug)

export function useRotatingPhoto(images: string[], veiled?: boolean, still = false): { photos: string[]; active: number; photo: string | null; onPhotoReady: (i: number) => void } {
  // 움직이는 대표 사진(01.webp, 헌터 길드 등)이나 표지 고정 작품이면 첫 장만 — 다른 사진으로 넘기지 않는다.
  const first = images[0]
  const photos = first && (still || /\.webp(\?|$)/.test(first)) ? [first] : veiled === false ? images : images.filter(src => !isUnveilPhoto(src))
  const [i, setI] = useState(0)
  const reduce = useReducedMotion()
  const n = photos.length
  // 다 받아서 그릴 수 있는 사진만 차례에 넣는다 — 덜 받은 사진으로 넘어가면 빈칸이 깜빡이거나 서서히 그려졌다.
  const ready = useRef(new Set<number>())
  const onPhotoReady = useCallback((k: number) => { ready.current.add(k) }, [])
  useEffect(() => {
    if (reduce || n < 2) return
    let id: ReturnType<typeof setInterval> | undefined
    const start = setTimeout(() => { id = setInterval(() => setI(v => { for (let s = 1; s < n; s++) { const k = (v + s) % n; if (ready.current.has(k)) return k } return v }), 1000) }, Math.random() * 1000)
    return () => { clearTimeout(start); clearInterval(id) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduce, n])
  const active = i % Math.max(n, 1)
  return { photos, active, photo: photos[active] ?? images[0] ?? null, onPhotoReady }
}
