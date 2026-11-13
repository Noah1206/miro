import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getOfficialBySlug } from '@/lib/characters'
import { ButtonLink } from '@/components/ui/button'
import { LogoMark } from '@/components/ui/logo'
import { RESULTS } from '@/lib/quiz'

type Params = { params: Promise<{ key: string }> }
const SITE = 'https://miroapp.app'

async function load(key: string) {
  const r = RESULTS[key]
  if (!r) return null
  const cover = (await getOfficialBySlug(r.slug))?.images.find(Boolean) ?? null
  return { ...r, cover }
}

/** 공유했을 때 링크 미리보기에 결과 이름과 히로인 표지가 뜬다 — 결과 카드를 따로 만들지 않는 이유. */
export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const r = await load((await params).key)
  if (!r) return {}
  const title = `미로에 떨어진 나: ${r.title}`
  const images = r.cover ? [r.cover] : undefined
  return { description: r.line, openGraph: { title, description: r.line, url: `/test/${(await params).key}`, images }, twitter: { card: 'summary_large_image', title, description: r.line, images } }
}

export default async function TestResult({ params }: Params) {
  const { key } = await params
  const r = await load(key)
  if (!r) notFound()
  const share = `https://twitter.com/intent/tweet?${new URLSearchParams({ text: `미로에 떨어진 나: ${r.title}\n${r.line}\n\n너는 뭐 나옴?`, url: `${SITE}/test/${key}?utm_source=test` })}`
  return (
    <main style={{ minHeight: '100dvh', display: 'grid', alignContent: 'center', padding: 'var(--space-6) var(--gutter)' }}>
      <div style={{ width: '100%', maxWidth: 440, margin: '0 auto', display: 'grid', gap: 'var(--space-4)' }}>
        {/* 결과 카드 — 홍보 카드와 같은 정사각: 표지 위에 유형 이름. */}
        <div style={{ position: 'relative', aspectRatio: '1', borderRadius: 'var(--radius-xl)', overflow: 'hidden', background: 'var(--color-surface-2)' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {r.cover && <img src={r.cover} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top' }} />}
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(8,6,14,0) 35%, rgba(8,6,14,.94) 88%)' }} />
          <span style={{ position: 'absolute', top: 14, left: 14, display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px 6px 8px', borderRadius: 999, background: 'rgba(12,10,20,.6)', fontWeight: 'var(--weight-bold)', fontSize: 'var(--font-caption)' }}><LogoMark size={20} />MIRO</span>
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: 'var(--space-5) var(--space-4)', textAlign: 'center' }}>
            <p className="t-caption" style={{ margin: '0 0 6px' }}>미로에 떨어진 나</p>
            <h1 className="t-display" style={{ margin: 0, wordBreak: 'keep-all' }}>{r.title}</h1>
            <p style={{ margin: '10px 0 0', color: 'var(--color-text-secondary)', wordBreak: 'keep-all' }}>{r.line}</p>
          </div>
        </div>
        <p className="t-caption" style={{ margin: 0, textAlign: 'center' }}>어울리는 히로인 · 「{r.work}」</p>
        <ButtonLink href={`/character/${r.slug}`} variant="primary" size="lg" full>이 히로인과 대화하기</ButtonLink>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-2)' }}>
          <ButtonLink href={share} target="_blank" rel="noopener noreferrer" full>X에 공유</ButtonLink>
          <ButtonLink href="/test" full>다시 하기</ButtonLink>
        </div>
      </div>
    </main>
  )
}
