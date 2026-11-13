'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { QUESTIONS, QUIZ_LENGTH, TRAITS, resultKey, type Trait } from '@/lib/quiz'

const shuffle = <T,>(xs: T[]) => xs.map(x => [Math.random(), x] as const).sort((a, b) => a[0] - b[0]).map(([, x]) => x)

/** 시작 화면 → 질문 8개(16개 중 무작위, 선택지도 섞음) → 결과 주소로 이동. 무작위는 '입장하기'를 누른 뒤에만 뽑는다(서버 그림과 어긋나지 않게). */
export function Quiz() {
  const router = useRouter()
  const [deck, setDeck] = useState<Array<{ q: string; options: Array<{ text: string; trait: Trait }> }> | null>(null)
  const [picks, setPicks] = useState<Trait[]>([])

  if (!deck) return (
    <div style={{ display: 'grid', gap: 'var(--space-5)', textAlign: 'center' }}>
      <h1 className="t-display" style={{ margin: 0 }}>당신의 성향은?<br />미로가 찍어 드립니다</h1>
      <p className="t-caption" style={{ margin: 0 }}>캐릭터챗에서 내가 끌리는 전개 · {QUIZ_LENGTH}문항 · 30초 · 로그인 없음</p>
      <Button variant="primary" size="lg" full onClick={() => setDeck(shuffle(QUESTIONS).slice(0, QUIZ_LENGTH).map(({ q, a }) => ({ q, options: shuffle(a.map((text, i) => ({ text, trait: TRAITS[i]! }))) })))}>시작하기</Button>
    </div>
  )

  const step = picks.length
  const cur = deck[Math.min(step, deck.length - 1)]!
  const pick = (trait: Trait) => {
    const next = [...picks, trait]
    setPicks(next)
    if (next.length === deck.length) router.push(`/test/${resultKey(next)}`)
  }
  return (
    <div style={{ display: 'grid', gap: 'var(--space-5)' }}>
      {/* 진행 — 미로 길이 한 칸씩 열린다. */}
      <div role="progressbar" aria-valuemin={0} aria-valuemax={deck.length} aria-valuenow={step} aria-label="진행" style={{ display: 'grid', gridTemplateColumns: `repeat(${deck.length}, 1fr)`, gap: 4 }}>
        {deck.map((_, i) => <span key={i} style={{ height: 4, borderRadius: 'var(--radius-xs)', background: i < step ? 'var(--color-accent)' : 'var(--color-surface-3)' }} />)}
      </div>
      <h2 className="t-display" style={{ margin: 0, minHeight: '2.4em' }}>{cur.q}</h2>
      <div style={{ display: 'grid', gap: 'var(--space-2)' }}>
        {cur.options.map(o => (
          <Button key={`${step}-${o.trait}`} size="lg" full disabled={step >= deck.length} onClick={() => pick(o.trait)} style={{ justifyContent: 'flex-start', textAlign: 'left', whiteSpace: 'normal' }}>{o.text}</Button>
        ))}
      </div>
    </div>
  )
}
