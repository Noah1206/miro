'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useReducedMotion } from 'motion/react'
import { isUnveilPhoto } from '@/lib/unveil-photo'

/**
 * 11/6: 홈·탐색 카드의 사진이 2초마다 저절로 다음 장으로.
 * 언베일 사진(unveil-…)은 언베일을 켠 사람(veiled === false)에게만 돌린다 — 카드엔 사진별 흐림이 없어서다.
 * 카드마다 시작을 조금씩 어긋나게 해 한꺼번에 바뀌지 않게 한다.
 */
export function useRotatingPhoto(images: string[], veiled?: boolean): { photos: string[]; active: number; photo: string | null; onPhotoReady: (i: number) => void } {
  // 움직이는 대표 사진(01.webp, 헌터 길드 등)이 있으면 그 한 장만 — 다른 사진으로 넘기지 않는다.
  const moving = images[0] && /\.webp(\?|$)/.test(images[0])
  const photos = moving ? [images[0]!] : veiled === false ? images : images.filter(src => !isUnveilPhoto(src))
  const [i, setI] = useState(0)
  const reduce = useReducedMotion()
  const n = photos.length
  // 다 받아서 그릴 수 있는 사진만 차례에 넣는다 — 덜 받은 사진으로 넘어가면 빈칸이 깜빡이거나 서서히 그려졌다.
  const ready = useRef(new Set<number>())
  const onPhotoReady = useCallback((k: number) => { ready.current.add(k) }, [])
  useEffect(() => {
    if (reduce || n < 2) return
    let id: ReturnType<typeof setInterval> | undefined
    const start = setTimeout(() => { id = setInterval(() => setI(v => { for (let s = 1; s < n; s++) { const k = (v + s) % n; if (ready.current.has(k)) return k } return v }), 2000) }, Math.random() * 1000)
    return () => { clearTimeout(start); clearInterval(id) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduce, n])
  const active = i % Math.max(n, 1)
  return { photos, active, photo: photos[active] ?? images[0] ?? null, onPhotoReady }
}
