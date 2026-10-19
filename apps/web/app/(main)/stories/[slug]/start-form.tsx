'use client'
import { useT } from '@/lib/i18n/client'
import { useActionState, useState } from 'react'
import { Button, useLoginSheet } from '@/components/ui'
import { SubmitButton } from '@/components/ui/submit-button'
import { CountedInput, CountedTextArea, LabeledField } from '@/app/(main)/create/form-parts'
import { startStory, type StartState } from '../actions'
import type { StoryPublic } from '@miro/domain'

export function LoginToStart({ slug }: { slug: string }) {
  const t = useT()
  const askLogin = useLoginSheet()
  return <Button type="button" variant="primary" full size="lg" onClick={() => askLogin(`/stories/${slug}`)}>{t('로그인하고 시작하기')}</Button>
}

/** 주인공 설정 — 이름·성인 나이·호칭·작품별 세부. 비워 두면 작품 기본값. 성격·배경은 유저가 적은 내용만 사용한다. */
export function StartForm({ slug, protagonist, defaultName, medium, hasRun, hasAdultRun = false, unveil = false }: { slug: string; protagonist: StoryPublic['protagonist']; defaultName: string; medium: string; hasRun: boolean; hasAdultRun?: boolean; unveil?: boolean }) {
  const t = useT()
  const [state, action] = useActionState<StartState, FormData>(startStory.bind(null, slug), { error: null })
  // 일반·성인용 회차는 따로 산다(10/19) — 어느 한쪽이라도 아직 없으면 폼을 펼쳐 둔다.
  const [open, setOpen] = useState(!hasRun || (unveil && !hasAdultRun))
  if (!open) return <Button type="button" variant="secondary" full onClick={() => setOpen(true)}>{t('새 회차 시작하기')}</Button>
  return (
    <form action={action} className="stack" style={{ gap: 16, padding: 'var(--space-4)', borderRadius: 'var(--radius-lg)', background: 'var(--color-surface-1)' }}>
      <input type="hidden" name="mode" value={hasRun ? 'new' : 'continue'} />
      <input type="hidden" name="adultMode" value={hasAdultRun ? 'new' : 'continue'} />
      <p className="t-title-3">{hasRun ? t('새 회차의 주인공') : t('내 주인공')}</p>
      {hasRun && <p className="t-caption" style={{ color: 'var(--color-text-secondary)' }}>{unveil ? t('같은 종류의 지금 회차만 보관되고, 새 회차는 처음부터 시작해요. 일반 회차와 성인용 회차는 서로 따로 이어져요.') : t('지금 회차는 보관되고, 새 회차는 처음부터 시작해요. 이전 회차의 기억은 이어지지 않아요.')}</p>}
      <LabeledField label={t('이름')} hint={t('비워 두면 {name}(으)로 불러요.', { name: protagonist.defaultName })}>
        <CountedInput name="name" ariaLabel={t('이름')} placeholder={protagonist.defaultName} max={20} defaultValue={defaultName} />
      </LabeledField>
      <LabeledField label={t('나이')} required hint={t('만 {age}세 이상', { age: protagonist.minAge })}>
        <input name="age" type="number" inputMode="numeric" min={protagonist.minAge} max={99} defaultValue={protagonist.minAge + 3} required aria-label={t('나이')}
          style={{ width: '100%', minHeight: 48, padding: '0 14px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', background: 'var(--color-surface-2)', color: 'var(--color-text-primary)', fontSize: 'var(--font-body)' }} />
      </LabeledField>
      <LabeledField label={t('불릴 호칭')}>
        <CountedInput name="honorific" ariaLabel={t('호칭')} placeholder={t('예) 이름만, 생도님')} max={12} />
      </LabeledField>
      {protagonist.fields.filter(f => !['이름', '나이', '호칭'].includes(f)).map(f => (
        <LabeledField key={f} label={t(f)}>
          {f === '내 성격과 배경'
            ? <CountedTextArea name={`detail:${f}`} ariaLabel={t(f)} placeholder={t('비워 둬도 돼요')} max={500} />
            : <CountedInput name={`detail:${f}`} ariaLabel={t(f)} placeholder={t('비워 둬도 돼요')} max={120} />}
        </LabeledField>
      ))}
      <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 'var(--font-caption)', lineHeight: 1.55 }}>
        <input name="contact" type="checkbox" style={{ marginTop: 2, width: 18, height: 18, accentColor: 'var(--color-accent)' }} />
        <span>{t('등장인물의 먼저 오는 연락을 미로 문자와 기기 알림으로 받을게요. 인물별로 언제든 끌 수 있어요. 밤 10시~아침 9시에는 보내지 않아요.')}</span>
      </label>
      <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 'var(--font-caption)', lineHeight: 1.55 }}>
        <input name="adult" type="checkbox" required style={{ marginTop: 2, width: 18, height: 18, accentColor: 'var(--color-accent)' }} />
        <span>{t('주인공({role})과 모든 등장인물이 성인인 이야기임을 확인했어요.', { role: protagonist.role })}</span>
      </label>
      {state.error && <p role="alert" className="t-caption" style={{ color: 'var(--color-danger)' }}>{t(state.error)}</p>}
      {/* 홈 언베일을 켜고 자격이 있으면 성인용 시작 버튼을 나란히(10/19). 어느 버튼인지는 서버가 자격과 함께 다시 본다. */}
      {unveil
        ? <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <SubmitButton full>{hasRun ? t('새 회차 시작') : t('첫 장면 시작')}</SubmitButton>
          <SubmitButton full name="unveil" value="on">{hasAdultRun ? t('성인용 새 회차 시작') : t('성인용 채팅으로 시작')}</SubmitButton>
        </div>
        : <SubmitButton full>{hasRun ? t('새 회차 시작') : t('첫 장면 시작')}</SubmitButton>}
    </form>
  )
}
