'use client'
import { useState, useTransition } from 'react'
import { useT } from '@/lib/i18n/client'
import { VoiceList, type VoiceOption } from '@/app/(main)/create/voice-list'
import { setRoomVoice } from '@/app/(main)/chat/[sessionId]/actions'

export type RoomVoice = { speakers: Array<{ key: string; name: string; defaultLabel: string | null }>; options: VoiceOption[]; overrides: Record<string, string> }

/**
 * 채팅방 '목소리'(11/8) — 화자(주인공·히로인)마다 목소리를 고른다. 처음엔 자동(만든 사람이 정한 목소리, 없으면 자동 배정)이고,
 * 고르면 이 방에서만 바뀐다. 다음에 읽는 대사부터 새 목소리(음성 캐시 키에 목소리가 들어 있어 이전 소리를 다시 쓰지 않는다).
 */
export function RoomVoicePanel({ sessionId, voice }: { sessionId: string; voice: RoomVoice }) {
  const t = useT()
  const [speaker, setSpeaker] = useState(voice.speakers[0]?.key ?? '')
  const [picked, setPicked] = useState<Record<string, string>>(voice.overrides)
  const [error, setError] = useState<string | null>(null)
  const [, start] = useTransition()
  const current = voice.speakers.find(s => s.key === speaker) ?? voice.speakers[0]
  if (!current) return null
  const choose = (id: string) => {
    const before = picked
    setPicked(p => { const n = { ...p }; if (id) n[current.key] = id; else delete n[current.key]; return n })
    setError(null)
    start(async () => {
      const r = await setRoomVoice(sessionId, current.key, id)
      if (r.error) { setPicked(before); setError(r.error) }
    })
  }
  return (
    <div className="stack" style={{ gap: 12 }}>
      {voice.speakers.length > 1 && <div role="tablist" aria-label={t('화자')} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {voice.speakers.map(s => <button key={s.key || 'main'} type="button" role="tab" aria-selected={s.key === current.key} onClick={() => setSpeaker(s.key)}
          style={{ minHeight: 34, padding: '0 14px', borderRadius: 999, border: 0, cursor: 'pointer', fontSize: 14, fontWeight: 600,
            background: s.key === current.key ? 'var(--color-text-primary)' : 'var(--color-surface-2)', color: s.key === current.key ? 'var(--color-bg)' : 'var(--color-text-secondary)' }}>{s.name}</button>)}
      </div>}
      <VoiceList key={current.key} voices={voice.options} value={picked[current.key] ?? ''} onChange={choose}
        autoLabel={current.defaultLabel ? `${t('자동')} · ${current.defaultLabel}` : t('자동')} />
      {error && <p className="t-caption" role="alert" style={{ margin: 0, color: 'var(--color-danger)' }}>{error}</p>}
    </div>
  )
}
