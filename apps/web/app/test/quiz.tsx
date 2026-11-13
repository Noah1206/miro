'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { QUESTION_SETS, resultKey, type Question, type TypeKey } from '@/lib/quiz'

const shuffle = <T,>(xs: T[]) => xs.map(x => [Math.random(), x] as const).sort((a, b) => a[0] - b[0]).map(([, x]) => x)

/** 시작 화면 → 질문 8개(두 벌 중 한 벌, 순서와 선택지를 섞음) → 결과 주소로 이동. 무작위는 '시작하기'를 누른 뒤에만 뽑는다(서버 그림과 어긋나지 않게). */
export function Quiz() {
  const router = useRouter()
  const [deck, setDeck] = useState<Question[] | null>(null)
  const [picks, setPicks] = useState<TypeKey[]>([])

  if (!deck) return (
    <div style={{ display: 'grid', gap: 'var(--space-5)', textAlign: 'center' }}>
      <h1 className="t-display" style={{ margin: 0, wordBreak: 'keep-all' }}>내가 남성향 웹소설에 빙의했다면?<br />나는 어떤 남주일까</h1>
      <p className="t-caption" style={{ margin: 0 }}>8가지 상황으로 알아보는 내 남주 유형 · 30초 · 로그인 없음</p>
      <Button variant="primary" size="lg" full onClick={() => setDeck(shuffle(shuffle(QUESTION_SETS)[0]!).map(q => ({ q: q.q, a: shuffle(q.a) })))}>테스트 시작하기</Button>
    </div>
  )

  const step = picks.length
  const cur = deck[Math.min(step, deck.length - 1)]!
  const pick = (type: TypeKey) => {
    const next = [...picks, type]
    setPicks(next)
    if (next.length === deck.length) router.push(`/test/${resultKey(next)}`)
  }
  return (
    <div style={{ display: 'grid', gap: 'var(--space-5)' }}>
      <div style={{ display: 'grid', gap: 'var(--space-2)' }}>
        <span className="t-caption">Q{Math.min(step + 1, deck.length)}/{deck.length}</span>
        <div role="progressbar" aria-valuemin={0} aria-valuemax={deck.length} aria-valuenow={step} aria-label="진행" style={{ display: 'grid', gridTemplateColumns: `repeat(${deck.length}, 1fr)`, gap: 4 }}>
          {deck.map((_, i) => <span key={i} style={{ height: 4, borderRadius: 'var(--radius-xs)', background: i < step ? 'var(--color-accent)' : 'var(--color-surface-3)' }} />)}
        </div>
      </div>
      <h2 className="t-display" style={{ margin: 0, minHeight: '2.4em', wordBreak: 'keep-all' }}>{cur.q}</h2>
      {/* 선택지는 세로 한 줄, 앞에 번호(11/13 요청). */}
      <div style={{ display: 'grid', gap: 'var(--space-2)' }}>
        {cur.a.map(([type, text], i) => (
          <Button key={`${step}-${type}`} size="lg" full disabled={step >= deck.length} onClick={() => pick(type)} style={{ justifyContent: 'flex-start', textAlign: 'left', whiteSpace: 'normal', wordBreak: 'keep-all', lineHeight: 1.45 }}>
            <span style={{ display: 'flex', gap: 10 }}><span aria-hidden style={{ flex: 'none', color: 'var(--color-accent-text)', fontWeight: 'var(--weight-bold)' }}>{i + 1}</span><span>{text}</span></span>
          </Button>
        ))}
      </div>
    </div>
  )
}
