'use client'
import { CharacterBriefing } from './character-briefing'
import type { CharacterEntry } from '@/lib/character-entry'
import { useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { UserPersona } from '@miro/domain'
type PresetPersona = UserPersona
import { Back, Page, Sheet } from '@/components/ui'
import { PersonaForm } from '@/app/(main)/persona/form'
import { useT } from '@/lib/i18n/client'

/** All character rooms confirm their own persona before showing the composer. */
export function ConversationPersona({ sessionId, initial, characterName, presets = [], context, entry, required = false, open: controlledOpen, onOpenChange, hideTrigger = false, inline = false }: {
  sessionId: string; initial: UserPersona | null; characterName: string; presets?: PresetPersona[]; context?: string | null; entry?: CharacterEntry | null; required?: boolean
  open?: boolean; onOpenChange?: (open: boolean) => void; hideTrigger?: boolean; inline?: boolean
}) {
  const t = useT(), router = useRouter()
  const [localOpen, setLocalOpen] = useState(false)
  const open = controlledOpen ?? localOpen
  const setOpen = onOpenChange ?? setLocalOpen
  const [saved, setSaved] = useState(false)
  const inlineDone = useCallback(() => { setSaved(true); router.refresh() }, [router])
  const done = () => { setOpen(false); router.refresh() }
  const form = <PersonaForm initial={initial} next={`/chat/${sessionId}`} sessionId={sessionId} onDone={inline ? inlineDone : done} presets={presets} submitLabel={required ? t('이 설정으로 시작하기') : t('저장')} />
  if (inline) return <div onChange={() => setSaved(false)} onClick={() => setSaved(false)}>
    {form}
    {saved && <p role="status" className="t-caption" style={{ marginTop: 10 }}>{t('저장했어요.')}</p>}
  </div>
  // 11/3 개편: 이름(사진 없음) → '나' 폼. 시작 상황 글은 사용자 요청으로 뺐다(첫 장면에서 바로 보인다).
  if (required) return <Page style={{ maxWidth: 520 }}>
    <header style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}><Back href="/archive" /></header>
    <div style={{ display: 'grid', gap: 4, marginBottom: 24 }}>
      <p className="t-caption" style={{ margin: 0, color: 'var(--color-text-tertiary)' }}>{t('이야기를 시작하기 전에')}</p>
      <h1 className="t-title-2" style={{ margin: 0 }}>{characterName}</h1>
    </div>
    {entry && <div style={{ marginBottom: 32 }}><CharacterBriefing entry={entry} /></div>}
    <h2 className="t-title-3" style={{ margin: '0 0 6px' }}>{t('이 이야기 속 나')}</h2>
    <p className="t-caption" style={{ margin: '0 0 20px', color: 'var(--color-text-tertiary)' }}>{t('이 대화에서만 쓰여요. 다른 대화의 설정은 바뀌지 않아요.')}</p>
    {form}
  </Page>
  return <>
    {!hideTrigger && <button type="button" data-coach="persona" className="hit" aria-label={t('페르소나 설정')} title={t('페르소나 설정')} onClick={() => setOpen(true)} style={{ width: 34, height: 34, display: 'grid', placeItems: 'center', flexShrink: 0, color: 'var(--color-text-secondary)' }}>
      <svg aria-hidden width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><circle cx="12" cy="8" r="3.5" /><path d="M5 21v-2a7 7 0 0 1 14 0v2" /></svg>
    </button>}
    <Sheet open={open} onClose={() => setOpen(false)} title={t('이 이야기 속 나')}>
      <div style={{ padding: '0 var(--gutter) var(--space-5)' }}>
        <p className="t-caption" style={{ color: 'var(--color-text-secondary)', marginBottom: 20 }}>{t('이 대화의 페르소나만 바뀌어요. 이전 대화 기록은 그대로 남아요.')}</p>
        {entry && <div style={{ marginBottom: 24 }}><CharacterBriefing entry={entry} /></div>}
        {open && form}
      </div>
    </Sheet>
  </>
}
