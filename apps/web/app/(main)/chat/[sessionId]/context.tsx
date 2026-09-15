'use client'
import { useState } from 'react'
import { Chip, Sheet } from '@/components/ui'

export type ContextData = {
  name: string; location: string; time: string; status: string | null
  relationship: string; scene: { mood: string; weather: string } | null
  events: Array<{ type: string; summary: string }>
  npcs: string[]
}

/** 관계는 문장으로, 세계는 장면으로. 숫자는 어디에도 없다. */
export function ContextContent({ d }: { d: ContextData }) {
  return (
    <div className="stack" style={{ gap: 'var(--space-5)' }}>
      <section>
        <h3 className="t-micro" style={{ marginBottom: 8 }}>당신과의 관계</h3>
        <p className="t-title-3 t-quote" style={{ color: 'var(--color-accent-text)' }}>{d.relationship}</p>
      </section>
      <section>
        <h3 className="t-micro" style={{ marginBottom: 8 }}>지금 이 세계</h3>
        <p className="t-body">{d.location} · {d.time}</p>
        {d.scene && (d.scene.mood || d.scene.weather) && <p className="t-caption">{[d.scene.mood, d.scene.weather].filter(Boolean).join(' · ')}</p>}
        {d.status && <p className="t-caption" style={{ color: 'var(--color-text-primary)', marginTop: 4 }}>{d.status}</p>}
      </section>
      {d.events.length > 0 && (
        <section>
          <h3 className="t-micro" style={{ marginBottom: 8 }}>일어나고 있는 일</h3>
          <div className="stack" style={{ gap: 8 }}>{d.events.map((e, i) => <p key={i} className="t-body t-quote">{e.summary}</p>)}</div>
        </section>
      )}
      {d.npcs.length > 0 && (
        <section>
          <h3 className="t-micro" style={{ marginBottom: 8 }}>주변 인물</h3>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{d.npcs.map((n) => <Chip key={n}>{n}</Chip>)}</div>
        </section>
      )}
    </div>
  )
}

/** 모바일: 헤더를 누르면 시트. 데스크톱: 오른쪽 패널이 항상 보인다. */
export function ContextTrigger({ d, children, className }: { d: ContextData; children: React.ReactNode; className?: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-label={`${d.name} — 관계와 세계 보기`} className={className}>{children}</button>
      <Sheet open={open} onClose={() => setOpen(false)} title={d.name}><ContextContent d={d} /></Sheet>
    </>
  )
}
