'use client'
import { Accordion, Button } from '@/components/ui'
import { CharacterVisual } from '@/components/character-visual'
import { Gallery, Rule, RealityStrip, SampleDialogue, Stat } from '../character/[slug]/sections'
import { subject, withParticle } from '@/lib/format'

/** 소개 페이지 미리보기에 필요한 값. 탭을 열 때 폼에서 한 번 읽는다. */
export type Snapshot = {
  name: string; tagline: string; age: string; nationality: string; occupation: string; mbti: string
  personality: string; startingContext: string; startingTime: string
  keywords: string[]; hobbies: string[]; dislikes: string[]
  dialogue: Array<{ role: 'character' | 'user' | 'narrator'; text: string }>
  /** 고른 사진들의 object URL. 첫 장이 대표, 나머지는 갤러리. 아직 저장소가 없어 미리보기에서만 보인다. */
  photo: string | null
  gallery: string[]
}

export function snapshot(form: HTMLFormElement): Snapshot {
  const fd = new FormData(form)
  const s = (k: string) => String(fd.get(k) ?? '').trim()
  const csv = (k: string) => s(k).split(',').map((t) => t.trim()).filter(Boolean)
  let dialogue: Snapshot['dialogue'] = []
  try { const raw = JSON.parse(s('sampleDialogue') || '[]'); if (Array.isArray(raw)) dialogue = raw } catch { /* 비어 있는 것으로 */ }
  const photos = fd.getAll('imagePreview').map(String).filter(Boolean)
  return {
    name: s('name'), tagline: s('title'), age: s('age'), nationality: s('nationality'), occupation: s('occupation'), mbti: s('mbti'),
    personality: s('personality'), startingContext: s('startingContext'), startingTime: s('startingTime'),
    keywords: [...csv('mood'), ...csv('relationshipKeywords')], hobbies: csv('hobbies'), dislikes: csv('dislikes'),
    dialogue, photo: photos[0] ?? null, gallery: photos.slice(1),
  }
}

/**
 * 상세 페이지(character/[slug]/page.tsx)와 같은 순서·같은 부품으로 그린다.
 * 실제 페이지의 구조가 바뀌면 여기도 같이 바꿔야 한다 — 둘이 어긋나면 미리보기가 거짓말을 한다.
 */
export function DetailPreview({ d }: { d: Snapshot | null }) {
  if (!d) return null
  const name = d.name || '이름'
  // 상세와 같은 문장 규칙: '32세 · 한국 · 검사.' / 'MBTI는 INTJ.' / '커피를 좋아하고, 무례함은 싫어한다.'
  const profile: string[] = [
    [
      [[d.age && `${d.age}세`, d.nationality, d.occupation].filter(Boolean).join(' · '), '.'].join(''),
      d.mbti ? `MBTI는 ${d.mbti}.` : '',
    ].filter((x) => x && x !== '.').join(' '),
    [
      d.hobbies.length > 0 ? `${withParticle(d.hobbies.join(', '), '을', '를')} 좋아하고,` : '',
      d.dislikes.length > 0 ? `${withParticle(d.dislikes.join(', '), '은', '는')} 싫어한다.` : '',
    ].filter(Boolean).join(' '),
  ].filter((line) => line.trim())
  const pill: React.CSSProperties = { position: 'absolute', top: 16, zIndex: 5, minHeight: 44, display: 'inline-flex', alignItems: 'center', padding: '0 14px', borderRadius: 'var(--radius-sm)', background: 'rgba(10,10,11,0.6)', color: 'var(--color-text-primary)' }

  return (
    <div style={{ marginTop: 'var(--space-4)' }}>
      <p className="t-caption" style={{ color: 'var(--color-text-tertiary)', marginBottom: 10 }}>등록하면 다른 사람에게 이렇게 보입니다.</p>
      <div aria-label="소개 페이지 미리보기" style={{ position: 'relative', borderRadius: 'var(--radius-lg)', overflow: 'hidden', border: '1px solid var(--color-border)', background: 'var(--color-bg)' }}>
        {/* 상세와 같은 자리: 왼쪽 위 뒤로, 오른쪽 위 편집(주인에게만 보이는 것) */}
        <span aria-hidden style={{ ...pill, left: 16, padding: '0 10px', color: 'var(--color-text-secondary)' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M15 5l-7 7 7 7" /></svg>
        </span>
        <span aria-hidden className="t-caption" style={{ ...pill, right: 16, fontWeight: 'var(--weight-medium)' }}>편집</span>

        <CharacterVisual name={name} accent={null} slug="preview" photo={d.photo} ratio="4 / 5" shared={false} style={{ borderRadius: 0, border: 0 }} />

        <div style={{ padding: '0 var(--gutter)', marginTop: 'calc(-1 * var(--space-6))', position: 'relative' }}>
          <p className="t-hero t-name" style={{ marginBottom: 8, fontWeight: 800, letterSpacing: '-0.03em', color: d.name ? undefined : 'var(--color-text-tertiary)' }}>{name}</p>
          <p className="t-body-lg t-quote" style={{ color: d.tagline ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)', lineHeight: 1.6, marginBottom: 12 }}>
            {d.tagline || '소개 한 줄이 여기에 걸립니다.'}
          </p>
          {d.keywords.length > 0 && (
            <p className="t-caption" style={{ color: 'var(--color-text-tertiary)', marginBottom: 14 }}>{d.keywords.map((t) => `#${t.replace(/\s+/g, '')}`).join(' ')}</p>
          )}
          {/* 통계 칩 — 대화한 사람 수는 0 이라 상세처럼 숨긴다. 보관하기는 모양만. */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 'var(--space-6)' }}>
            <Stat icon="comment" label="댓글 0" />
            <span aria-hidden style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 9px', minHeight: 32, borderRadius: 7, fontSize: 'var(--font-caption)', background: 'var(--color-surface-2)', color: 'var(--color-text-secondary)' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z" /></svg>
              보관하기
            </span>
          </div>

          <RealityStrip />

          <Rule label="첫 장면">
            <div className="detail-prose">
              <p className="t-body-lg t-quote" style={{ color: d.startingContext ? undefined : 'var(--color-text-tertiary)' }}>
                {d.startingContext || '첫 장면을 아직 적지 않았어요.'}
              </p>
              <p className="t-caption" style={{ color: 'var(--color-text-tertiary)', marginTop: 8 }}>{d.startingTime || '저녁'}부터 시작합니다.</p>
            </div>
            {d.dialogue.length > 0 && (
              <div style={{ marginTop: 18 }}><SampleDialogue name={name} portrait={d.photo} turns={d.dialogue} /></div>
            )}
          </Rule>

          {d.gallery.length > 0 && (
            <div style={{ marginTop: 'var(--space-7)' }}><Gallery name={name} images={d.gallery} /></div>
          )}

          <div style={{ marginTop: 'var(--space-7)' }}>
            <Accordion title="이 사람에 대해">
              <div className="detail-prose">
                <p className="t-body-lg" style={{ color: d.personality ? 'var(--color-text-secondary)' : 'var(--color-text-tertiary)' }}>
                  {d.personality || '성격을 아직 적지 않았어요.'}
                </p>
                {profile.map((line) => <p key={line} className="t-body-lg" style={{ color: 'var(--color-text-secondary)' }}>{line}</p>)}
              </div>
            </Accordion>
          </div>

          <Rule label="댓글 0" action={<span className="t-caption" style={{ color: 'var(--color-accent-text)', fontWeight: 'var(--weight-semibold)' }}>전체보기</span>}>
            <p className="t-caption" style={{ color: 'var(--color-text-tertiary)' }}>아직 댓글이 없어요.</p>
          </Rule>
        </div>

        {/* 비슷한 캐릭터 — 같은 분위기의 다른 캐릭터가 있을 때 여기에 실린다. */}
        <section aria-label="비슷한 캐릭터" style={{ marginTop: 'var(--space-7)', padding: '0 var(--gutter)' }}>
          <h2 className="t-title-3" style={{ marginBottom: 8 }}>{subject(name)} 마음에 들었다면</h2>
          <p className="t-caption" style={{ color: 'var(--color-text-tertiary)' }}>같은 분위기의 다른 캐릭터가 등록되어 있으면 여기에 실립니다.</p>
        </section>

        {/* 상세의 고정 하단 문 — 미리보기 안에서는 맨 아래에 */}
        <div aria-hidden style={{ padding: '14px var(--gutter) var(--space-5)', marginTop: 'var(--space-6)', background: 'linear-gradient(to top, rgba(10,10,11,0.96) 60%, rgba(10,10,11,0))' }}>
          <Button type="button" variant="primary" size="lg" full disabled>대화 시작하기</Button>
        </div>
      </div>
    </div>
  )
}
