import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getOfficialBySlug } from '@/lib/characters'
import { ButtonLink } from '@/components/ui/button'
import { LogoMark } from '@/components/ui/logo'
import { RESULTS, type TypeKey } from '@/lib/quiz'

type Params = { params: Promise<{ key: string }> }
const SITE = 'https://miroapp.app'

/** 결과 카드의 그림 = 유형별 '환상의 케미' 히로인(11/13 힉스필드: 케미 작품의 사진을 참조로 넣어 같은 그림체로, 테스트 질문의 상황에 맞춰 새로 그림 — public/quiz/<유형>.jpg). 추천 작품은 표지를 읽는다. */
async function load(key: string) {
  const r = RESULTS[key as TypeKey]
  if (!r) return null
  const coverOf = async (slug: string) => (await getOfficialBySlug(slug))?.images.find(Boolean) ?? null
  const recCovers = await Promise.all(r.recs.map(w => coverOf(w.slug)))
  return { ...r, cover: `/quiz/${key}.jpg`, recs: r.recs.map((w, i) => ({ ...w, cover: recCovers[i] ?? null })) }
}

/** 공유했을 때 링크 미리보기에 유형 이름과 표지가 뜬다 — 결과 카드를 따로 만들지 않는 이유. */
export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { key } = await params
  const r = await load(key)
  if (!r) return {}
  const title = `내 남주 유형은 [${r.title}]`
  const images = [r.cover]
  return { description: r.desc, openGraph: { title, description: r.desc, url: `/test/${key}`, images }, twitter: { card: 'summary_large_image', title, description: r.desc, images } }
}

const chip: React.CSSProperties = { padding: '4px 10px', borderRadius: 'var(--radius-sm)', background: 'var(--color-surface-2)', color: 'var(--color-accent-text)', fontSize: 'var(--font-caption)' }

export default async function TestResult({ params }: Params) {
  const { key } = await params
  const r = await load(key)
  if (!r) notFound()
  const share = `https://twitter.com/intent/tweet?${new URLSearchParams({ text: `내 남주 유형은 [${r.title}]입니다!\n${r.quote}\n\n내 유형은 뭘까? [내가 남성향 웹소설에 빙의했다면?] 테스트 하러 가기\n#미로_남주테스트 #미로`, url: `${SITE}/test?utm_source=test` })}`
  return (
    <main style={{ minHeight: '100dvh', display: 'grid', alignContent: 'center', padding: 'var(--space-6) var(--gutter)' }}>
      {/* 11/13 태블릿 폭(768)까지 넓힌다 — 넓으면 카드와 설명이 좌우로, 좁으면 위아래로. */}
      <div style={{ width: '100%', maxWidth: 768, margin: '0 auto', display: 'grid', gap: 'var(--space-5)' }}>
       <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', gap: 'var(--space-5)', alignItems: 'start' }}>
        {/* 결과 카드 — 홍보 카드와 같은 정사각: 표지 위에 유형 이름과 대사. */}
        <div style={{ position: 'relative', aspectRatio: '1', borderRadius: 'var(--radius-xl)', overflow: 'hidden', background: 'var(--color-surface-2)' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {r.cover && <img src={r.cover} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top' }} />}
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(8,6,14,0) 35%, rgba(8,6,14,.94) 88%)' }} />
          <span style={{ position: 'absolute', top: 14, left: 14, display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px 6px 8px', borderRadius: 999, background: 'rgba(12,10,20,.6)', fontWeight: 'var(--weight-bold)', fontSize: 'var(--font-caption)' }}><LogoMark size={20} />MIRO</span>
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: 'var(--space-5) var(--space-4)', textAlign: 'center' }}>
            <p className="t-caption" style={{ margin: '0 0 6px' }}>당신의 남주 유형</p>
            <h1 className="t-hero" style={{ margin: 0 }}>{r.title}</h1>
            <p style={{ margin: '10px 0 0', color: 'var(--color-text-secondary)', wordBreak: 'keep-all' }}>{r.quote}</p>
          </div>
        </div>
        <div style={{ display: 'grid', gap: 'var(--space-4)' }}>
        <ul style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: 0, padding: 0, listStyle: 'none' }}>
          {r.tags.map(t => <li key={t} style={chip}>#{t.replace(/ /g, '_')}</li>)}
        </ul>
        <p style={{ margin: 0, wordBreak: 'keep-all' }}>{r.desc}</p>
        {/* 이 유형이 끌리는 인기 태그 */}
        <div style={{ display: 'grid', gap: 'var(--space-2)' }}>
          <span className="t-caption">{r.title}이 끌리는 태그</span>
          <ul style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: 0, padding: 0, listStyle: 'none' }}>
            {r.likes.map(t => <li key={t} style={{ ...chip, color: 'var(--color-text-primary)' }}>#{t}</li>)}
          </ul>
        </div>
        {/* 환상의 케미·파국의 조합 — 히로인 유형. */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-2)', textAlign: 'center' }}>
          {[['환상의 케미', r.chemi.type], ['파국의 조합', r.bad]].map(([label, type]) => (
            <div key={label} style={{ padding: 'var(--space-3)', borderRadius: 'var(--radius-lg)', background: 'var(--color-surface-2)' }}>
              <div className="t-caption">{label}</div>
              <div style={{ marginTop: 4, fontSize: 'var(--font-title-3)', fontWeight: 'var(--weight-bold)' }}>{type}</div>
            </div>
          ))}
        </div>
        <ButtonLink href={`/character/${r.chemi.slug}`} variant="primary" size="lg" full style={{ whiteSpace: 'normal', textAlign: 'center', wordBreak: 'keep-all' }}>나와 환상의 케미, {r.chemi.type} 만나러 가기</ButtonLink>
        </div>
       </div>
        {/* 추천 작품 — 세로가 조금 더 긴(4:5) 표지 카드 그리드. */}
        <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
          <p className="t-caption" style={{ margin: 0 }}>{r.title}에게 추천하는 작품</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 'var(--space-3)' }}>
            {r.recs.map(w => (
              <a key={w.slug} href={`/character/${w.slug}`} style={{ position: 'relative', display: 'block', aspectRatio: '4 / 5', borderRadius: 'var(--radius-lg)', overflow: 'hidden', background: 'var(--color-surface-2)', color: 'var(--color-text-primary)' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {w.cover && <img src={w.cover} alt="" loading="lazy" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top' }} />}
                <span style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '28px 10px 10px', background: 'linear-gradient(180deg, rgba(8,6,14,0), rgba(8,6,14,.92))', fontSize: 'var(--font-caption)', fontWeight: 'var(--weight-semibold)', lineHeight: 1.35, wordBreak: 'keep-all' }}>{w.name}</span>
              </a>
            ))}
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-2)' }}>
          <ButtonLink href={share} target="_blank" rel="noopener noreferrer" variant="ghost" full>결과 공유하기</ButtonLink>
          <ButtonLink href="/test" variant="ghost" full>다시 하기</ButtonLink>
        </div>
      </div>
    </main>
  )
}
