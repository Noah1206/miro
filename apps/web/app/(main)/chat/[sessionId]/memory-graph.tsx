'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { MemoryGraph, MemoryLayer, MemoryNode } from '@miro/domain'
import type { MemoryNoteItem, MemoryNotes } from '@/app/api/memory-graph/[sessionId]/route'
/** 서버 한도(route USER_NOTE_MAX)와 같다 — 라우트 파일은 DB 를 불러오므로 값은 가져오지 않는다. */
const USER_NOTE_MAX = 1000
import { msg } from '@/lib/i18n'
import { useT } from '@/lib/i18n/client'

/** 계층별 색 — 기억의 종류를 색으로 구분한다. 관계 수치는 여기 없다. */
const LAYER = {
  long_term: { color: 'var(--color-accent)', label: msg('너에 대해 아는 것') },
  relationship: { color: 'var(--color-accent-text)', label: msg('둘 사이에 있었던 일') },
  world: { color: 'var(--color-text-tertiary)', label: msg('세계') },
  short_term: { color: 'var(--color-text-tertiary)', label: msg('지금 이야기') },
  story: { color: 'var(--color-text-tertiary)', label: msg('지난 이야기') },
} as const satisfies Record<MemoryLayer, { color: string; label: string }>
/** 노트 목록 순서 — 지금 이야기부터. */
const ORDER: MemoryLayer[] = ['short_term', 'story', 'long_term', 'relationship', 'world']
/** 직접 적을 수 있는 칸. */
const ADDABLE = ['long_term', 'relationship', 'world'] as const

type Placed = MemoryNode & { x: number; y: number; r: number }

/**
 * 힘 기반 배치 — 태그를 공유하면 끌어당기고, 모든 노드는 서로 밀어낸다.
 * 라이브러리를 쓰지 않는다. 노드가 수십 개 규모라 이 정도로 충분하다.
 * ponytail: O(n²) 반발력 계산. 노드가 수백 개를 넘으면 격자 분할이나 d3-force 로 올린다.
 */
function layout(g: MemoryGraph, width: number, height: number): Placed[] {
  const cx = width / 2, cy = height / 2
  // 같은 기억은 새로고침해도 같은 자리에서 시작한다 — id 로 각도를 정한다.
  const nodes: Placed[] = g.nodes.map((n, i) => {
    const seed = [...n.id].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 3600, 7) / 3600
    const angle = seed * Math.PI * 2 + i * 0.1
    const radius = Math.min(width, height) * (0.18 + seed * 0.22)
    return { ...n, x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius, r: 5 + n.weight * 9 }
  })
  const index = new Map(nodes.map((n) => [n.id, n]))

  for (let step = 0; step < 120; step++) {
    const cool = 1 - step / 120
    for (const e of g.edges) {
      const a = index.get(e.source), b = index.get(e.target)
      if (!a || !b) continue
      const dx = b.x - a.x, dy = b.y - a.y
      const dist = Math.hypot(dx, dy) || 1
      // 공유 태그가 많을수록 가깝게 붙는다.
      const target = 90 / Math.min(3, e.weight)
      const pull = ((dist - target) / dist) * 0.06 * cool
      a.x += dx * pull; a.y += dy * pull; b.x -= dx * pull; b.y -= dy * pull
    }
    for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i]!, b = nodes[j]!
      const dx = b.x - a.x, dy = b.y - a.y
      const dist = Math.hypot(dx, dy) || 1
      const min = a.r + b.r + 26
      if (dist >= min) continue
      const push = ((min - dist) / dist) * 0.5 * cool
      a.x -= dx * push; a.y -= dy * push; b.x += dx * push; b.y += dy * push
    }
    for (const n of nodes) {
      n.x += (cx - n.x) * 0.012 * cool
      n.y += (cy - n.y) * 0.012 * cool
      n.x = Math.max(n.r + 8, Math.min(width - n.r - 8, n.x))
      n.y = Math.max(n.r + 8, Math.min(height - n.r - 8, n.y))
    }
  }
  return nodes
}

const W = 320, H = 300

async function call(sessionId: string, method: 'POST' | 'PATCH' | 'DELETE', body: object): Promise<string | null> {
  const r = await fetch(`/api/memory-graph/${sessionId}`, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null)
  if (r?.ok) return null
  const e = await r?.json().catch(() => null) as { error?: string } | null
  return e?.error ?? 'failed'
}

/**
 * 기억 노트 — 캐릭터가 기억하는 것들을 그래프와 글로 보고, 고치고, 고정하고, 직접 적는다(11/3).
 * 턴이 끝날 때마다 refreshKey 가 바뀌어 새로 불러온다.
 */
export function MemoryGraphView({ sessionId, refreshKey }: { sessionId: string; refreshKey: number }) {
  const t = useT()
  const [graph, setGraph] = useState<MemoryNotes | null>(null)
  const [failed, setFailed] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [compacting, setCompacting] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const seen = useRef(new Set<string>())
  const reload = () => setAttempt(a => a + 1)

  useEffect(() => {
    let live = true
    setFailed(false)
    fetch(`/api/memory-graph/${sessionId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('failed'))))
      .then((g: MemoryNotes) => { if (live) setGraph(g) })
      .catch(() => { if (live) setFailed(true) })
    return () => { live = false }
  }, [sessionId, refreshKey, attempt])

  const placed = useMemo(() => (graph ? layout(graph, W, H) : []), [graph])
  const index = useMemo(() => new Map(placed.map((n) => [n.id, n])), [placed])

  // 이번에 새로 생긴 기억은 한 번 반짝인다 — 방금 기억됐다는 걸 보여준다.
  const fresh = useMemo(() => {
    const next = new Set(placed.map((n) => n.id))
    const added = placed.filter((n) => seen.current.size > 0 && !seen.current.has(n.id)).map((n) => n.id)
    seen.current = next
    return new Set(added)
  }, [placed])

  if (failed) return (
    <div className="stack" style={{ gap: 8, alignItems: 'flex-start' }}>
      <p className="t-caption" role="alert">{t('기억을 불러오지 못했어요.')}</p>
      <button type="button" className="t-caption hit" onClick={reload}
        style={{ background: 'none', border: 0, padding: 0, textDecoration: 'underline', color: 'var(--color-text-primary)' }}>{t('다시 시도')}</button>
    </div>
  )
  if (!graph) return <p className="t-caption">{t('기억을 그리는 중…')}</p>

  const items = graph.items
  const active = selected ? items.find(i => i.id === selected) ?? null : null
  const linked = new Set(
    graph.edges.filter((e) => e.source === selected || e.target === selected)
      .map((e) => (e.source === selected ? e.target : e.source)),
  )
  const chapters = items.filter(i => i.layer === 'story').length
  const compact = async () => {
    setCompacting(true); setNotice(null)
    const error = await call(sessionId, 'POST', { action: 'compact' })
    setCompacting(false)
    if (error) setNotice(t('정리하지 못했어요. 잠시 뒤 다시 시도해 주세요.')); else reload()
  }

  return (
    <div className="stack" style={{ gap: 10 }}>
      {placed.length > 0 && <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img"
        aria-label={t('기억 {n}개와 연결 {m}개', { n: placed.length, m: graph.edges.length })}
        style={{ maxHeight: H, touchAction: 'pan-y' }}
        onClick={(e) => { if (e.target === e.currentTarget) setSelected(null) }}>
        {graph.edges.map((e, i) => {
          const a = index.get(e.source), b = index.get(e.target)
          if (!a || !b) return null
          const dim = selected !== null && e.source !== selected && e.target !== selected
          return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y}
            stroke="var(--color-text-tertiary)" strokeWidth={Math.min(2.5, 0.6 + e.weight * 0.5)}
            opacity={dim ? 0.06 : 0.28} />
        })}
        {placed.map((n) => {
          const dim = selected !== null && n.id !== selected && !linked.has(n.id)
          const toggle = () => setSelected(n.id === selected ? null : n.id)
          return (
            <g key={n.id} role="button" tabIndex={0} aria-label={t('{layer} 기억 열기', { layer: t(LAYER[n.layer].label) })} onClick={toggle}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle() } }} style={{ cursor: 'pointer' }}>
              {/* 터치 영역 — 시각 반경은 그대로 두고 히트 반경만 22px(≈44px 지름)를 보장한다 (§6) */}
              <circle cx={n.x} cy={n.y} r={Math.max(n.r + 6, 22)} fill="transparent" />
              <circle cx={n.x} cy={n.y} r={n.r} fill={LAYER[n.layer].color} opacity={dim ? 0.15 : 0.85}>
                {fresh.has(n.id) && <animate attributeName="r" values={`${n.r};${n.r * 1.8};${n.r}`} dur="1.1s" repeatCount="2" />}
              </circle>
              {n.id === selected && <circle cx={n.x} cy={n.y} r={n.r + 4} fill="none" stroke={LAYER[n.layer].color} strokeWidth="1.5" opacity={0.7} />}
            </g>
          )
        })}
      </svg>}

      {/* 계층 범례 — 색만으로 구분하지 않는다 (§4.2). world/short_term 은 같은 색이라 한 항목으로 묶는다. */}
      {placed.length > 0 && <p className="t-caption" style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 14px' }}>
        {[['long_term', LAYER.long_term.label], ['relationship', LAYER.relationship.label], ['world', msg('세계')]].map(([k, label]) => (
          <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <span aria-hidden style={{ width: 8, height: 8, borderRadius: 4, background: LAYER[k as MemoryLayer].color }} />{t(label!)}
          </span>
        ))}
      </p>}

      {active
        ? <MemoryEditor key={active.id} sessionId={sessionId} item={active} onDone={() => { setSelected(null); reload() }} />
        : <p className="t-caption">{items.length ? t('기억 {n}개 · 점이나 아래 목록을 누르면 보고 고칠 수 있어요.', { n: items.length }) : t('아직 기억이 쌓이지 않았어요. 대화를 나누면 여기에 남아요.')}</p>}

      <UserNote key={graph.note} sessionId={sessionId} initial={graph.note} onDone={reload} />
      <MemoryAdd sessionId={sessionId} onDone={reload} />

      {/* 기억 노트 — 누르면 위 편집기가 열린다. 지금 이야기·지난 이야기는 그래프엔 없고 여기에만 있다. */}
      {ORDER.map((layer) => {
        const list = items.filter((n) => n.layer === layer)
        if (!list.length) return null
        return (
          <div key={layer} className="stack" style={{ gap: 4 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <p className="t-micro" style={{ color: 'var(--color-text-tertiary)' }}>{t(LAYER[layer].label)}</p>
              {layer === 'story' && chapters >= 2 && <button type="button" className="t-caption" disabled={compacting} onClick={compact}
                style={{ background: 'none', border: 0, padding: '4px 0', color: 'var(--color-text-secondary)', textDecoration: 'underline', cursor: 'pointer' }}>
                {compacting ? t('정리하는 중…') : t('{n}편 하나로 정리하기', { n: chapters })}</button>}
            </div>
            {list.map((n) => (
              <button key={n.id} type="button" className="t-caption hit" aria-pressed={n.id === selected} onClick={() => setSelected(n.id === selected ? null : n.id)}
                style={{ textAlign: 'left', background: n.id === selected ? 'var(--color-surface-3)' : 'var(--color-surface-2)', border: 0, borderRadius: 8, padding: '8px 10px', color: 'var(--color-text-primary)', cursor: 'pointer', whiteSpace: 'pre-wrap' }}>
                {n.pinned && <span style={{ color: 'var(--color-accent-text)', fontWeight: 600, marginRight: 6 }}>{t('고정')}</span>}
                {n.content}
              </button>
            ))}
          </div>
        )
      })}
      {notice && <p className="t-caption" role="alert">{notice}</p>}
    </div>
  )
}

const buttonBase = { minHeight: 36, padding: '0 14px', borderRadius: 8, border: 0, cursor: 'pointer' } as const
const fieldStyle = { width: '100%', resize: 'vertical', padding: 10, borderRadius: 8, border: '1px solid var(--color-border)', background: 'var(--color-surface-2)', color: 'var(--color-text-primary)' } as const

/** 고른 기억 하나를 고치거나 고정하거나 지운다. 지우기는 한 번 더 눌러야 한다 — 되돌릴 수 없다. */
function MemoryEditor({ sessionId, item, onDone }: { sessionId: string; item: MemoryNoteItem; onDone: () => void }) {
  const t = useT()
  const [text, setText] = useState(item.content)
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const max = item.type === 'short_term_summary' || item.type === 'chapter' ? 1500 : 300
  const send = async (method: 'PATCH' | 'DELETE', body: object) => {
    setBusy(true); setError(null)
    const e = await call(sessionId, method, { id: item.id, ...body })
    setBusy(false)
    if (!e) onDone(); else setError(e === 'pin_limit' ? t('고정은 한 방에 5개까지예요.') : t('저장하지 못했어요. 다시 시도해 주세요.'))
  }
  const changed = text.trim() !== item.content && text.trim().length > 0
  return (
    <div className="stack" style={{ gap: 6 }}>
      <p className="t-micro" style={{ color: 'var(--color-text-tertiary)' }}>{t(LAYER[item.layer].label)}</p>
      <textarea value={text} maxLength={max} rows={item.layer === 'story' || item.layer === 'short_term' ? 6 : 3} aria-label={t('기억 내용')}
        onChange={(e) => { setText(e.target.value); setConfirm(false) }} className="t-body" style={fieldStyle} />
      {item.layer === 'short_term' && <p className="t-caption" style={{ color: 'var(--color-text-tertiary)' }}>{t('지금 이야기는 대화가 이어지면 AI가 새로 고쳐 써요. 고친 내용은 다음 요약에 이어져요.')}</p>}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        {item.layer !== 'short_term' && <button type="button" disabled={busy} onClick={() => send('PATCH', { pinned: !item.pinned })} className="t-caption"
          style={{ ...buttonBase, background: 'none', color: 'var(--color-text-secondary)' }}>{item.pinned ? t('고정 풀기') : t('고정')}</button>}
        <button type="button" disabled={busy} onClick={() => confirm ? send('DELETE', {}) : setConfirm(true)} className="t-caption"
          style={{ ...buttonBase, background: 'none', color: confirm ? 'var(--color-danger, #ff5a5a)' : 'var(--color-text-secondary)' }}>{confirm ? t('정말 지우기') : t('지우기')}</button>
        <button type="button" disabled={busy || !changed} onClick={() => send('PATCH', { content: text })} className="t-caption"
          style={{ ...buttonBase, background: changed ? 'var(--color-accent)' : 'var(--color-surface-3)', color: changed ? 'var(--color-white)' : 'var(--color-text-tertiary)' }}>{t('저장')}</button>
      </div>
      {error && <p className="t-caption" role="alert">{error}</p>}
    </div>
  )
}

/** 11/10 유저노트(크랙 대비) — 이 방에서 캐릭터가 반드시 기억할 설정. 매 턴 최근 대화 뒤에 실려 긴 대화에서도 흐려지지 않는다. */
function UserNote({ sessionId, initial, onDone }: { sessionId: string; initial: string; onDone: () => void }) {
  const t = useT()
  const [text, setText] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [state, setState] = useState<'idle' | 'saved' | 'error'>('idle')
  const changed = text.trim() !== initial
  const save = async () => {
    setBusy(true); setState('idle')
    const e = await call(sessionId, 'POST', { action: 'note', content: text })
    setBusy(false)
    if (e) setState('error'); else { setState('saved'); onDone() }
  }
  return (
    <div className="stack" style={{ gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
        <p className="t-micro" style={{ color: 'var(--color-text-tertiary)' }}>{t('유저노트')}</p>
        <span className="t-micro" style={{ color: 'var(--color-text-tertiary)' }}>{text.length}/{USER_NOTE_MAX}</span>
      </div>
      <textarea value={text} maxLength={USER_NOTE_MAX} rows={4} aria-label={t('유저노트')} placeholder={t('캐릭터가 이 이야기에서 꼭 기억했으면 하는 설정을 적어 주세요. 매 답변에 반영돼요.')}
        onChange={(e) => { setText(e.target.value); setState('idle') }} className="t-body" style={fieldStyle} />
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center' }}>
        {state === 'saved' && !changed && <span className="t-caption" role="status" style={{ color: 'var(--color-text-tertiary)' }}>{t('저장했어요')}</span>}
        {state === 'error' && <span className="t-caption" role="alert">{t('저장하지 못했어요. 다시 시도해 주세요.')}</span>}
        <button type="button" disabled={busy || !changed} onClick={save} className="t-caption"
          style={{ ...buttonBase, background: changed ? 'var(--color-accent)' : 'var(--color-surface-3)', color: changed ? 'var(--color-white)' : 'var(--color-text-tertiary)' }}>{t('저장')}</button>
      </div>
    </div>
  )
}

/** 기억 직접 적기 — 캐릭터가 꼭 알았으면 하는 것을 사용자가 남긴다. */
function MemoryAdd({ sessionId, onDone }: { sessionId: string; onDone: () => void }) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const [layer, setLayer] = useState<(typeof ADDABLE)[number]>('long_term')
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  if (!open) return (
    <button type="button" className="t-caption" onClick={() => setOpen(true)}
      style={{ ...buttonBase, alignSelf: 'flex-start', padding: '0 12px', background: 'var(--color-surface-2)', color: 'var(--color-text-primary)' }}>{t('+ 기억 직접 적기')}</button>
  )
  const add = async () => {
    setBusy(true); setError(false)
    const e = await call(sessionId, 'POST', { action: 'add', layer, content: text })
    setBusy(false)
    if (e) { setError(true); return }
    setText(''); setOpen(false); onDone()
  }
  return (
    <div className="stack" style={{ gap: 6 }}>
      <div role="radiogroup" aria-label={t('기억 종류')} style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {ADDABLE.map(l => <button key={l} type="button" role="radio" aria-checked={layer === l} onClick={() => setLayer(l)} className="t-caption"
          style={{ ...buttonBase, minHeight: 32, padding: '0 12px', borderRadius: 999, background: layer === l ? 'var(--color-text-primary)' : 'var(--color-surface-2)', color: layer === l ? 'var(--color-surface-1)' : 'var(--color-text-secondary)' }}>{t(LAYER[l].label)}</button>)}
      </div>
      <textarea value={text} maxLength={300} rows={3} aria-label={t('적을 기억')} placeholder={t('예: 나는 매운 음식을 못 먹는다')}
        onChange={(e) => setText(e.target.value)} className="t-body" style={fieldStyle} />
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button type="button" disabled={busy} onClick={() => { setOpen(false); setText('') }} className="t-caption" style={{ ...buttonBase, background: 'none', color: 'var(--color-text-secondary)' }}>{t('취소')}</button>
        <button type="button" disabled={busy || !text.trim()} onClick={add} className="t-caption"
          style={{ ...buttonBase, background: text.trim() ? 'var(--color-accent)' : 'var(--color-surface-3)', color: text.trim() ? 'var(--color-white)' : 'var(--color-text-tertiary)' }}>{t('추가')}</button>
      </div>
      {error && <p className="t-caption" role="alert">{t('저장하지 못했어요. 다시 시도해 주세요.')}</p>}
    </div>
  )
}
