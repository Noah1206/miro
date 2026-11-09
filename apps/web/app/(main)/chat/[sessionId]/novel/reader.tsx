'use client'
import { useState } from 'react'
import type { NovelChapter } from '@miro/db'
import { Button } from '@/components/ui'
import { useT } from '@/lib/i18n/client'
import { useWallet } from '@/components/wallet/provider'
import type { NovelView } from '@/lib/novel'

/** 한 화씩 POST 를 되풀이해 끝까지 쓴다(11/9) — 한 요청이 300초 한도를 넘지 않게. */
export function NovelReader({ sessionId, initial }: { sessionId: string; initial: NovelView }) {
  const t = useT()
  const { openRecharge, refreshBalance } = useWallet()
  const [chapters, setChapters] = useState<NovelChapter[]>(initial.chapters)
  const [free, setFree] = useState(initial.free)
  const [writing, setWriting] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)

  async function run(reset = false) {
    setError(null)
    let list = reset ? [] : chapters
    if (reset) { setChapters([]); setFree(false) }
    try {
      for (let first = true; ; first = false) {
        setWriting(list.length + 1)
        const res = await fetch(`/api/sessions/${sessionId}/novel`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ reset: reset && first }) })
        const data = await res.json().catch(() => ({})) as { chapter?: NovelChapter | null; done?: boolean; error?: string; limit?: string }
        if (data.limit) { openRecharge(); setError(t('미로가 부족해요. 충전한 뒤 이어서 만들 수 있어요.')); break }
        if (!res.ok) { setError(data.error === 'busy' ? t('이미 쓰는 중이에요. 잠시 뒤 다시 열어 주세요.') : t('웹소설을 쓰지 못했어요. 다시 시도해 주세요.')); break }
        if (data.chapter) { list = [...list, data.chapter]; setChapters(list) }
        if (data.done || !data.chapter) { if (initial.endingTitle) setFree(false); break }
      }
    } finally {
      setWriting(null)
      void refreshBalance(true)
    }
  }

  function download() {
    const body = [initial.title, ...(initial.endingTitle ? [`ENDING · ${initial.endingTitle}`] : []), '', ...chapters.map(c => `${c.n}화. ${c.title}\n\n${c.text}\n`)].join('\n')
    const url = URL.createObjectURL(new Blob([body], { type: 'text/plain;charset=utf-8' }))
    const a = Object.assign(document.createElement('a'), { href: url, download: `${initial.title.replace(/[\\/:*?"<>|]/g, '_')}.txt` })
    a.click()
    URL.revokeObjectURL(url)
  }

  const cost = t('{n} 미로/화', { n: initial.price.toLocaleString() })
  return (
    <div className="stack" style={{ gap: 'var(--space-5)' }}>
      <div className="stack" style={{ gap: 8 }}>
        <Button variant="primary" full status={writing ? 'loading' : 'idle'} onClick={() => void run()}>
          {writing ? t('{n}화 쓰는 중…', { n: writing }) : chapters.length ? t('이어서 만들기') : t('웹소설 만들기')}
        </Button>
        <p className="t-caption" style={{ color: 'var(--color-text-secondary)', textAlign: 'center' }}>
          {free ? t('결말을 본 기념으로 첫 웹소설은 무료예요.') : cost}
        </p>
        {error && <p role="alert" className="t-caption" style={{ color: 'var(--color-danger)', textAlign: 'center' }}>{error}</p>}
        {chapters.length > 0 && !writing && <>
          <Button variant="secondary" full onClick={download}>{t('TXT로 받기')}</Button>
          {/* 가운데 팝업 대신 두 번 누르기 — 지금 쓴 화가 지워진다. */}
          <Button variant="ghost" size="sm" onClick={() => { if (confirming) { setConfirming(false); void run(true) } else setConfirming(true) }}>
            {confirming ? t('한 번 더 누르면 지금 쓴 화를 지우고 다시 써요') : `${t('처음부터 다시 만들기')} · ${cost}`}
          </Button>
        </>}
      </div>
      {chapters.length > 0 && <nav aria-label={t('목차')} className="stack" style={{ gap: 4 }}>
        {chapters.map(c => <a key={c.n} href={`#novel-${c.n}`} className="t-caption" style={{ color: 'var(--color-text-secondary)' }}>{t('{n}화', { n: c.n })} · {c.title}</a>)}
      </nav>}
      {chapters.map(c => (
        <article key={c.n} id={`novel-${c.n}`} className="stack" style={{ gap: 12 }}>
          <h2 className="t-title-3">{t('{n}화', { n: c.n })} · {c.title}</h2>
          <div className="t-body" style={{ whiteSpace: 'pre-wrap', lineHeight: 1.85 }}>{c.text}</div>
        </article>
      ))}
    </div>
  )
}
