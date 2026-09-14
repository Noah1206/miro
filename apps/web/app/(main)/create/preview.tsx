'use client'
import { Accordion, Button } from '@/components/ui'
import { CharacterVisual } from '@/components/character-visual'
import { Rule, RealityStrip, SampleDialogue, Stat } from '../character/[slug]/sections'
import { withParticle } from '@/lib/format'

/** 소개 페이지 미리보기에 필요한 값. 탭을 열 때 폼에서 한 번 읽는다. */
export type Snapshot = {
  name: string; tagline: string; age: string; nationality: string; occupation: string; mbti: string
  personality: string; startingContext: string; startingTime: string
  keywords: string[]; hobbies: string[]; dislikes: string[]
  dialogue: Array<{ role: 'character' | 'user' | 'narrator'; text: string }>
  /** 고른 사진의 object URL. 아직 저장소가 없어 미리보기에서만 보인다. */
  photo: string | null
}

export function snapshot(form: HTMLFormElement): Snapshot {
  const fd = new FormData(form)
  const s = (k: string) => String(fd.get(k) ?? '').trim()
  const csv = (k: string) => s(k).split(',').map((t) => t.trim()).filter(Boolean)
  let dialogue: Snapshot['dialogue'] = []
  try { const raw = JSON.parse(s('sampleDialogue') || '[]'); if (Array.isArray(raw)) dialogue = raw } catch { /* 비어 있는 것으로 */ }
  const file = form.querySelector<HTMLInputElement>('input[type="file"]')?.files?.[0]
  return {
    name: s('name'), tagline: s('title'), age: s('age'), nationality: s('nationality'), occupation: s('occupation'), mbti: s('mbti'),
    personality: s('personality'), startingContext: s('startingContext'), startingTime: s('startingTime'),
    keywords: [...csv('mood'), ...csv('relationshipKeywords')], hobbies: csv('hobbies'), dislikes: csv('dislikes'),
    dialogue, photo: file ? URL.createObjectURL(file) : null,
  }
}

/**
 * 상세 페이지(character/[slug]/page.tsx)와 같은 순서·같은 부품으로 그린다.
 * 실제 페이지의 구조가 바뀌면 여기도 같이 바꿔야 한다 — 둘이 어긋나면 미리보기가 거짓말을 한다.
 */
export function DetailPreview({ d }: { d: Snapshot | null }) {
  if (!d) return null
  const name = d.name || '이름'
  const profile = [
    [[d.age && `${d.age}세`, d.nationality, d.occupation].filter(Boolean).join(' · '), d.mbti ? `MBTI는 ${d.mbti}.` : ''].filter(Boolean).join('. ').replace(/\.\./g, '.'),
    [
      d.hobbies.length > 0 ? `${withParticle(d.hobbies.join(', '), '을', '를')} 좋아하고,` : '',
      d.dislikes.length > 0 ? `${withParticle(d.dislikes.join(', '), '은', '는')} 싫어한다.` : '',
    ].filter(Boolean).join(' '),
  ].filter((line) => line.trim())

  return (
    <div style={{ marginTop: 'var(--space-4)' }}>
      <p className="t-caption" style={{ color: 'var(--color-text-tertiary)', marginBottom: 10 }}>등록하면 다른 사람에게 이렇게 보입니다.</p>
      <div style={{ borderRadius: 'var(--radius-lg)', overflow: 'hidden', border: '1px solid var(--color-border)', background: 'var(--color-bg)', paddingBottom: 'var(--space-5)' }}>
        <CharacterVisual name={name} accent={null} slug="preview" photo={d.photo} ratio="4 / 5" shared={false} style={{ borderRadius: 0, border: 0 }} />

        <div style={{ padding: '0 var(--gutter)', marginTop: 'calc(-1 * var(--space-6))', position: 'relative' }}>
          <p className="t-hero t-name" style={{ marginBottom: 8, fontWeight: 800, letterSpacing: '-0.03em', color: d.name ? undefined : 'var(--color-text-tertiary)' }}>{name}</p>
          <p className="t-body-lg t-quote" style={{ color: d.tagline ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)', lineHeight: 1.6, marginBottom: 12 }}>
            {d.tagline || '소개 한 줄이 여기에 걸립니다.'}
          </p>
          {d.keywords.length > 0 && (
            <p className="t-caption" style={{ color: 'var(--color-text-tertiary)', marginBottom: 14 }}>{d.keywords.map((t) => `#${t.replace(/\s+/g, '')}`).join(' ')}</p>
          )}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 'var(--space-6)' }}>
            <Stat icon="comment" label="댓글 0" />
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

          <div style={{ marginTop: 'var(--space-7)' }} aria-hidden>
            <Button type="button" variant="primary" size="lg" full disabled>대화 시작하기</Button>
          </div>
        </div>
      </div>
    </div>
  )
}
