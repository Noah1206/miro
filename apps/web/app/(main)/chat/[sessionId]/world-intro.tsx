'use client'
import { useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { PERSONA_LIMITS, type UserPersona } from '@miro/domain'
import { useT } from '@/lib/i18n/client'
import { PersonaForm } from '@/app/(main)/persona/form'

/**
 * 첫 대화 전 세계관 카드(11/4 사용자: 베이비챗 인트로처럼 — 세계관을 알려 주고, 거기에 맞는 자기 페르소나를 반드시 적고 시작).
 * 저장하면 이 대화방의 '나'가 되고 화면을 새로 읽어 입력창이 열린다. 첫 턴 전에 방 페르소나가 없으면 서버도 턴을 받지 않는다.
 */
/** 작품 소개의 [당신] 단락(11/4) — 작품이 정해 둔 '나'. 페르소나 칸을 미리 채워 이름만 적으면 시작하게 한다. 없으면 ''. */
function cardSelf(personality: string): string {
  const m = personality.match(/\[당신\]\n([\s\S]*?)(?=\n\[|$)/)
  return m?.[1] ? m[1].split('\n').map(l => l.replace(/^·\s*/, '').trim()).filter(Boolean).join(' ').slice(0, PERSONA_LIMITS.description) : ''
}

export function WorldIntro({ sessionId, worldSetting, guide, presets, personality, audience }: { sessionId: string; worldSetting: string | null; guide: string; presets: UserPersona[]; personality: string; audience: string | null }) {
  const t = useT(), router = useRouter()
  const done = useCallback(() => router.refresh(), [router])
  // 11/6 사용자: '준비된 페르소나'엔 만든 사람이 올린 것만
  const picks = presets
  // 11/4 사용자: 작품이 정한 '나'를 기본값으로 — 만든 사람의 첫 준비 페르소나, 없으면 소개의 [당신] 단락
  const self = cardSelf(personality)
  const initial: UserPersona | null = presets[0] ?? (self ? { name: '', gender: audience === 'male' ? 'male' : audience === 'female' ? 'female' : null, description: self } : null)
  return (
    <section aria-labelledby="world-intro-title" style={{ margin: 'var(--space-5) 0', padding: '18px 16px', borderRadius: 18, background: 'var(--color-surface-1)', border: '1px solid var(--color-border)' }}>
      {worldSetting && <>
        <h2 id="world-intro-title" className="t-micro" style={{ marginBottom: 6, color: 'var(--color-lavender-200, #d9cfff)' }}>{t('세계관')}</h2>
        <p className="t-body" style={{ whiteSpace: 'pre-line', marginBottom: 18 }}>{worldSetting}</p>
      </>}
      <h2 id={worldSetting ? undefined : 'world-intro-title'} className="t-micro" style={{ marginBottom: 4 }}>{t('이 세계에서의 나')}</h2>
      <p className="t-caption" style={{ marginBottom: 12, color: 'var(--color-text-tertiary)' }}>{t('대화를 시작하기 전에, 이 세계에서 당신이 누구인지 적어 주세요.')}</p>
      <PersonaForm initial={initial} next={`/chat/${sessionId}`} submitLabel={t('이 사람으로 시작')} submitStyle={{ background: 'var(--color-white)', border: '1px solid var(--color-white)', color: 'var(--color-accent-on)', fontWeight: 400 }} sessionId={sessionId} presets={picks}
        guide={guide || t('이 세계에서 당신은 어떤 사람인가요? 나이, 하는 일, 성격, 지금 처지를 적어 주세요.')} onDone={done} />
    </section>
  )
}
