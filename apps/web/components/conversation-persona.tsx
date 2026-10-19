'use client'
import { CharacterBriefing } from './character-briefing'
import type { CharacterEntry } from '@/lib/character-entry'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { UserPersona } from '@miro/domain'
import { Back, Page, Sheet } from '@/components/ui'
import { PersonaForm } from '@/app/(main)/persona/form'
import { useT } from '@/lib/i18n/client'

/** All character rooms confirm their own persona before showing the composer. */
export function ConversationPersona({ sessionId, initial, characterName, context, entry, required = false }: {
  sessionId: string; initial: UserPersona | null; characterName: string; context?: string | null; entry?: CharacterEntry | null; required?: boolean
}) {
  const t = useT(), router = useRouter()
  const [open, setOpen] = useState(false)
  const done = () => { setOpen(false); router.refresh() }
  const form = <PersonaForm initial={initial} next={`/chat/${sessionId}`} sessionId={sessionId} onDone={done} submitLabel={required ? t('이 설정으로 시작하기') : t('저장')} />
  if (required) return <Page style={{ maxWidth: 480 }}>
    <header style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}><Back href="/archive" /><span>{characterName}</span></header>
    <h1 className="t-title-2" style={{ marginBottom: 12 }}>{t('이 이야기 속 나')}</h1>
    <p className="t-body" style={{ color: 'var(--color-text-secondary)', marginBottom: 20 }}>{t('캐릭터를 만나기 전에, 이 대화에서의 내 모습을 정해 주세요. 다른 대화의 설정은 바뀌지 않아요.')}</p>
    {entry && <div style={{ marginBottom: 24 }}><CharacterBriefing entry={entry} /></div>}
    {!entry && context && <p className="t-caption" style={{ padding: 16, marginBottom: 24, lineHeight: 1.7, background: 'var(--color-surface-1)', borderRadius: 12 }}>{context.slice(0, 400)}</p>}
    {form}
  </Page>
  return <>
    <button type="button" data-coach="persona" className="hit" aria-label={t('페르소나 설정')} title={t('페르소나 설정')} onClick={() => setOpen(true)} style={{ width: 34, height: 34, display: 'grid', placeItems: 'center', flexShrink: 0, color: 'var(--color-text-secondary)' }}>
      <svg aria-hidden width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><circle cx="12" cy="8" r="3.5" /><path d="M5 21v-2a7 7 0 0 1 14 0v2" /></svg>
    </button>
    <Sheet open={open} onClose={() => setOpen(false)} title={t('이 이야기 속 나')}>
      <div style={{ padding: '0 var(--gutter) var(--space-5)' }}>
        <p className="t-caption" style={{ color: 'var(--color-text-secondary)', marginBottom: 20 }}>{t('이 대화의 페르소나만 바뀌어요. 이전 대화 기록은 그대로 남아요.')}</p>
        {entry && <div style={{ marginBottom: 24 }}><CharacterBriefing entry={entry} /></div>}
        {open && form}
      </div>
    </Sheet>
  </>
}
