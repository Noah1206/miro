'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useT } from '@/lib/i18n/client'
import { VoiceList, type VoiceOption } from '@/app/(main)/create/voice-list'
import { setRoomVoice } from '@/app/(main)/chat/[sessionId]/actions'

export type RoomVoice = { speakers: Array<{ key: string; name: string; defaultLabel: string | null }>; options: VoiceOption[]; overrides: Record<string, string> }

/**
 * 채팅방 '목소리'(11/8) — 화자(주인공·히로인)마다 목소리를 고른다. 처음엔 자동(만든 사람이 정한 목소리, 없으면 자동 배정)이고,
 * 고르면 이 방에서만 바뀐다. 다음에 읽는 대사부터 새 목소리(음성 캐시 키에 목소리가 들어 있어 이전 소리를 다시 쓰지 않는다).
 */
export function RoomVoicePanel({ sessionId, voice }: { sessionId: string; voice: RoomVoice }) {
  const t = useT(), router = useRouter()
  const [open, setOpen] = useState<string | null>(null)
  const [picked, setPicked] = useState<Record<string, string>>(voice.overrides)
  const [error, setError] = useState<string | null>(null)
  const [, start] = useTransition()
  if (!voice.speakers.length) return null
  const choose = (key: string, id: string) => {
    const before = picked
    setPicked(p => { const n = { ...p }; if (id) n[key] = id; else delete n[key]; return n })
    setError(null)
    start(async () => {
      const r = await setRoomVoice(sessionId, key, id)
      if (r.error) { setPicked(before); setError(r.error) }
      else router.refresh()   // 메뉴를 닫았다 다시 열면 서버 값으로 다시 그리므로, 저장한 값이 바로 반영되게
    })
  }
  // 11/10 사용자: 음성 모드 토글 아래 캐릭터 목록 — 줄마다 지금 목소리, 누르면 그 캐릭터의 목소리 목록이 펼쳐진다.
  return (
    <div style={{ display: 'grid', gap: 6, marginBottom: 10 }}>
      {voice.speakers.map(s => {
        const id = picked[s.key] ?? ''
        const label = id ? voice.options.find(o => o.id === id)?.label ?? t('자동') : s.defaultLabel ? `${t('자동')} · ${s.defaultLabel}` : t('자동')
        const expanded = open === s.key
        return <div key={s.key || 'main'} style={{ borderRadius: 12, background: 'var(--color-surface-2)' }}>
          <button type="button" aria-expanded={expanded} onClick={() => setOpen(expanded ? null : s.key)}
            style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', minHeight: 46, padding: '0 14px', border: 0, background: 'transparent', color: 'var(--color-text-primary)', font: 'inherit', fontSize: 15, fontWeight: 600, cursor: 'pointer', textAlign: 'left' }}>
            <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</span>
            <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '55%' }}>{label}</span>
            <svg aria-hidden width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ flex: 'none', transform: expanded ? 'rotate(90deg)' : undefined, transition: 'transform .15s' }}><path d="M9 6l6 6-6 6"/></svg>
          </button>
          {expanded && <div style={{ padding: '0 10px 10px' }}>
            <VoiceList voices={voice.options} value={id} onChange={v => choose(s.key, v)}
              autoLabel={s.defaultLabel ? `${t('자동')} · ${s.defaultLabel}` : t('자동')} />
          </div>}
        </div>
      })}
      {error && <p className="t-caption" role="alert" style={{ margin: 0, color: 'var(--color-danger)' }}>{error}</p>}
    </div>
  )
}
