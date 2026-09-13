'use client'
import { AnimatePresence } from 'motion/react'
import { useState } from 'react'
import { Popover, MenuItem, TransitionLink } from '@/components/ui'
import { CharacterText, Line, SceneMeta, UserText } from '@/components/scene/text'
import { usePress } from '@/lib/motion/use-press'

export type Msg = { id: string; role: string; kind: string; content: string; blocks: Array<Record<string, unknown>> }

export function MessageList({ items, characterName }: { items: Msg[]; characterName: string }) {
  return (
    <div role="log" aria-live="polite" aria-relevant="additions" aria-label={characterName + ' 대화'} className="stack" style={{ gap: 'var(--space-4)' }}>
      <AnimatePresence initial={false}>
        {items.map((m) => <Line key={m.id}><Message m={m} characterName={characterName} /></Line>)}
      </AnimatePresence>
    </div>
  )
}

function Message({ m, characterName }: { m: Msg; characterName: string }) {
  const reality = m.blocks.find((b) => b.type === 'reality') as { senderLabel?: string; channelLabel?: string; caption?: string | null } | undefined
  if (m.role === 'user') return <UserText content={m.content} />
  if (m.kind === 'hidden') return <p data-hidden-message className="t-caption" style={{ fontStyle: 'italic' }}>{m.content}</p>
  if (m.kind === 'call_record') return <SceneMeta><span data-call-record>☏ {m.content}</span></SceneMeta>
  if (m.kind === 'photo') {
    return (
      <Reportable id={m.id} kind="photo">
        {reality && <RealityTag sender={reality.senderLabel} channel={reality.channelLabel} />}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={m.content} alt={reality?.caption ? `캐릭터가 보낸 사진 — ${reality.caption}` : '캐릭터가 보낸 사진'} style={{ maxWidth: '72%', borderRadius: 'var(--radius-md)' }} />
        {reality?.caption && <p className="t-caption t-quote">{reality.caption}</p>}
      </Reportable>
    )
  }
  if (m.kind === 'reality_message') {
    // 캐릭터가 먼저 보낸 연락 — 세계관의 표현(편지·문자·사내 메신저)을 함께. 이 순간만 관계색 한 줄.
    return (
      <Reportable id={m.id} kind="message">
        <RealityTag sender={reality?.senderLabel} channel={reality?.channelLabel} />
        <div data-reality-message style={{ paddingLeft: 12, borderLeft: '2px solid var(--color-accent)' }}>
          <CharacterText content={m.content} name={characterName} size="lg" />
        </div>
      </Reportable>
    )
  }
  return <Reportable id={m.id} kind="message"><CharacterText content={m.content} name={characterName} /></Reportable>
}

function RealityTag({ sender, channel }: { sender?: string; channel?: string }) {
  return <p className="t-micro" style={{ color: 'var(--color-accent-text)', textTransform: 'none', letterSpacing: '0.04em' }}>{[sender, channel].filter(Boolean).join(' · ')}</p>
}

/**
 * 신고 진입점 (n30). 작은 링크는 항상 보이고, 꾹 누르면 같은 메뉴가 뜬다 —
 * 제스처만으로 접근되는 기능은 두지 않는다.
 */
function Reportable({ id, kind, children }: { id: string; kind: 'message' | 'photo'; children: React.ReactNode }) {
  const [menu, setMenu] = useState(false)
  const { handlers } = usePress({ onLongPress: () => setMenu(true) })
  const href = `/report?type=${kind}&id=${id}`
  return (
    <div {...handlers} className="stack" style={{ gap: 6, position: 'relative', touchAction: 'pan-y' }}>
      {children}
      <TransitionLink href={href} aria-label="신고" className="t-micro" style={{ alignSelf: 'flex-start', textTransform: 'none', letterSpacing: 0, minHeight: 24, display: 'inline-flex', alignItems: 'center', padding: '0 6px', marginLeft: -6 }}>신고</TransitionLink>
      <Popover open={menu} onClose={() => setMenu(false)}>
        <MenuItem type="button" onClick={() => { setMenu(false); window.location.href = href }}>이 내용 신고</MenuItem>
      </Popover>
    </div>
  )
}
