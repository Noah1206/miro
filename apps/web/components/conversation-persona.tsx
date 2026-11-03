'use client'
import { CharacterBriefing } from './character-briefing'
import type { CharacterEntry } from '@/lib/character-entry'
import { useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { UserPersona } from '@miro/domain'
import { Back, Page, Sheet } from '@/components/ui'
import { PersonaForm } from '@/app/(main)/persona/form'
import { useT } from '@/lib/i18n/client'

/** All character rooms confirm their own persona before showing the composer. */
export function ConversationPersona({ sessionId, initial, characterName, photo, context, entry, required = false, open: controlledOpen, onOpenChange, hideTrigger = false, inline = false }: {
  sessionId: string; initial: UserPersona | null; characterName: string; photo?: string | null; context?: string | null; entry?: CharacterEntry | null; required?: boolean
  open?: boolean; onOpenChange?: (open: boolean) => void; hideTrigger?: boolean; inline?: boolean
}) {
  const t = useT(), router = useRouter()
  const [localOpen, setLocalOpen] = useState(false)
  const open = controlledOpen ?? localOpen
  const setOpen = onOpenChange ?? setLocalOpen
  const [saved, setSaved] = useState(false)
  const inlineDone = useCallback(() => { setSaved(true); router.refresh() }, [router])
  const done = () => { setOpen(false); router.refresh() }
  const form = <PersonaForm initial={initial} next={`/chat/${sessionId}`} sessionId={sessionId} onDone={inline ? inlineDone : done} submitLabel={required ? t('이 설정으로 시작하기') : t('저장')} />
  if (inline) return <div onChange={() => setSaved(false)} onClick={() => setSaved(false)}>
    {form}
    {saved && <p role="status" className="t-caption" style={{ marginTop: 10 }}>{t('저장했어요.')}</p>}
  </div>
  // 11/3 개편: 캐릭터 얼굴·이름이 먼저, 시작 상황은 읽히는 카드로, 그다음 '나' — 글만 늘어선 화면이 아니라 이야기에 들어가는 문처럼.
  if (required) return <Page style={{ maxWidth: 520 }}>
    <header style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}><Back href="/archive" /></header>
    <div style={{ display: 'grid', justifyItems: 'center', gap: 10, textAlign: 'center', marginBottom: 28 }}>
      {photo
        ? <img src={photo} alt="" width={88} height={88} style={{ width: 88, height: 88, borderRadius: '50%', objectFit: 'cover', objectPosition: 'top', boxShadow: '0 0 0 3px var(--color-bg), 0 0 0 5px color-mix(in srgb, var(--color-lavender-500) 55%, transparent)' }} />
        : <div aria-hidden style={{ width: 88, height: 88, borderRadius: '50%', display: 'grid', placeItems: 'center', background: 'var(--color-surface-2)', fontSize: 32, fontWeight: 600 }}>{characterName.slice(0, 1)}</div>}
      <h1 className="t-title-2" style={{ margin: 0 }}>{characterName}</h1>
      <p className="t-caption" style={{ margin: 0, color: 'var(--color-text-tertiary)' }}>{t('이야기를 시작하기 전에')}</p>
    </div>
    {entry && <div style={{ marginBottom: 32 }}><CharacterBriefing entry={entry} /></div>}
    {!entry && context && <section style={{ padding: '18px 20px', marginBottom: 32, borderRadius: 16, background: 'var(--color-surface-1)', border: '1px solid #ffffff0d' }}>
      <h2 style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 600, color: 'var(--color-lavender-400, var(--color-lavender-500))' }}>{t('시작 상황')}</h2>
      <p style={{ margin: 0, fontSize: 15, lineHeight: 1.75, color: 'var(--color-text-secondary)' }}>{context.slice(0, 400)}</p>
    </section>}
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
