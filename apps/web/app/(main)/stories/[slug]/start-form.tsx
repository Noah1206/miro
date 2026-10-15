'use client'
import { useActionState, useState } from 'react'
import { Button, useLoginSheet } from '@/components/ui'
import { SubmitButton } from '@/components/ui/submit-button'
import { CountedInput, LabeledField } from '@/app/(main)/create/form-parts'
import { startStory, type StartState } from '../actions'
import type { StoryPublic } from '@miro/domain'
import { withParticle } from '@/lib/format'

export function LoginToStart({ slug }: { slug: string }) {
  const askLogin = useLoginSheet()
  return <Button type="button" variant="primary" full size="lg" onClick={() => askLogin(`/stories/${slug}`)}>로그인하고 시작하기</Button>
}

/** 주인공 설정 — 이름·성인 나이·호칭·작품별 세부. 비워 두면 작품 기본값. 성격·감정·과거는 묻지도 채우지도 않는다. */
export function StartForm({ slug, protagonist, defaultName, medium, hasRun }: { slug: string; protagonist: StoryPublic['protagonist']; defaultName: string; medium: string; hasRun: boolean }) {
  const [state, action] = useActionState<StartState, FormData>(startStory.bind(null, slug), { error: null })
  const [open, setOpen] = useState(!hasRun)
  if (!open) return <Button type="button" variant="secondary" full onClick={() => setOpen(true)}>새 회차 시작하기</Button>
  return (
    <form action={action} className="stack" style={{ gap: 16, padding: 'var(--space-4)', borderRadius: 'var(--radius-lg)', background: 'var(--color-surface-1)' }}>
      <input type="hidden" name="mode" value={hasRun ? 'new' : 'continue'} />
      <p className="t-title-3">{hasRun ? '새 회차의 주인공' : '내 주인공'}</p>
      {hasRun && <p className="t-caption" style={{ color: 'var(--color-text-secondary)' }}>지금 회차는 보관되고, 새 회차는 처음부터 시작해요. 이전 회차의 기억은 이어지지 않아요.</p>}
      <LabeledField label="이름" hint={`비워 두면 '${protagonist.defaultName}'(으)로 불러요.`}>
        <CountedInput name="name" ariaLabel="이름" placeholder={protagonist.defaultName} max={20} defaultValue={defaultName} />
      </LabeledField>
      <LabeledField label="나이" required hint={`만 ${protagonist.minAge}세 이상`}>
        <input name="age" type="number" inputMode="numeric" min={protagonist.minAge} max={99} defaultValue={protagonist.minAge + 3} required aria-label="나이"
          style={{ width: '100%', minHeight: 48, padding: '0 14px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', background: 'var(--color-surface-2)', color: 'var(--color-text-primary)', fontSize: 'var(--font-body)' }} />
      </LabeledField>
      <LabeledField label="불릴 호칭">
        <CountedInput name="honorific" ariaLabel="호칭" placeholder="예) 이름만, 생도님" max={12} />
      </LabeledField>
      {protagonist.fields.filter(f => !['이름', '나이', '호칭'].includes(f)).map(f => (
        <LabeledField key={f} label={f}>
          <CountedInput name={`detail:${f}`} ariaLabel={f} placeholder="비워 둬도 돼요" max={120} />
        </LabeledField>
      ))}
      <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 'var(--font-caption)', lineHeight: 1.55 }}>
        <input name="contact" type="checkbox" defaultChecked style={{ marginTop: 2, width: 18, height: 18, accentColor: 'var(--color-accent)' }} />
        <span>등장인물이 이야기 속 일 때문에 먼저 {withParticle(medium, '으로', '로')} 연락해도 좋아요. (인물별로 언제든 끌 수 있어요)</span>
      </label>
      <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 'var(--font-caption)', lineHeight: 1.55 }}>
        <input name="adult" type="checkbox" required style={{ marginTop: 2, width: 18, height: 18, accentColor: 'var(--color-accent)' }} />
        <span>주인공({protagonist.role})과 모든 등장인물이 성인인 이야기임을 확인했어요.</span>
      </label>
      {state.error && <p role="alert" className="t-caption" style={{ color: 'var(--color-danger)' }}>{state.error}</p>}
      <SubmitButton full>{hasRun ? '새 회차 시작' : '첫 장면 시작'}</SubmitButton>
    </form>
  )
}
