'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { MemoryGraph, MemoryNode } from '@miro/domain'

/** 계층별 색 — 기억의 종류를 색으로 구분한다. 관계 수치는 여기 없다. */
const LAYER = {
  long_term: { color: 'var(--color-accent)', label: '너에 대해 아는 것' },
  relationship: { color: 'var(--color-accent-text)', label: '둘 사이에 있었던 일' },
  world: { color: 'var(--color-text-tertiary)', label: '세계' },
  short_term: { color: 'var(--color-text-tertiary)', label: '최근' },
} as const

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

/**
 * 기억 그래프 — 캐릭터가 기억하는 것들과, 그것들이 어떻게 이어져 있는지.
 * 턴이 끝날 때마다 refreshKey 가 바뀌어 새로 불러온다.
 */
export function MemoryGraphView({ sessionId, refreshKey }: { sessionId: string; refreshKey: number }) {
  const [graph, setGraph] = useState<MemoryGraph | null>(null)
  const [failed, setFailed] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const seen = useRef(new Set<string>())

  useEffect(() => {
    let live = true
    setFailed(false)
    fetch(`/api/memory-graph/${sessionId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('failed'))))
      .then((g: MemoryGraph) => { if (live) setGraph(g) })
      .catch(() => { if (live) setFailed(true) })
    return () => { live = false }
  }, [sessionId, refreshKey])

  const placed = useMemo(() => (graph ? layout(graph, W, H) : []), [graph])
  const index = useMemo(() => new Map(placed.map((n) => [n.id, n])), [placed])

  // 이번에 새로 생긴 기억은 한 번 반짝인다 — 방금 기억됐다는 걸 보여준다.
  const fresh = useMemo(() => {
    const next = new Set(placed.map((n) => n.id))
    const added = placed.filter((n) => seen.current.size > 0 && !seen.current.has(n.id)).map((n) => n.id)
    seen.current = next
    return new Set(added)
  }, [placed])

  if (failed) return <p className="t-caption">기억을 불러오지 못했어요.</p>
  if (!graph) return <p className="t-caption">기억을 그리는 중…</p>
  if (placed.length === 0) return <p className="t-caption">아직 기억이 쌓이지 않았어요. 대화를 나누면 여기에 남아요.</p>

  const active = selected ? index.get(selected) : null
  const linked = new Set(
    graph.edges.filter((e) => e.source === selected || e.target === selected)
      .map((e) => (e.source === selected ? e.target : e.source)),
  )

  return (
    <div className="stack" style={{ gap: 10 }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img"
        aria-label={`기억 ${placed.length}개와 연결 ${graph.edges.length}개`}
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
          return (
            <g key={n.id} onClick={() => setSelected(n.id === selected ? null : n.id)} style={{ cursor: 'pointer' }}>
              <circle cx={n.x} cy={n.y} r={n.r} fill={LAYER[n.layer].color} opacity={dim ? 0.15 : 0.85}>
                {fresh.has(n.id) && <animate attributeName="r" values={`${n.r};${n.r * 1.8};${n.r}`} dur="1.1s" repeatCount="2" />}
              </circle>
              {n.id === selected && <circle cx={n.x} cy={n.y} r={n.r + 4} fill="none" stroke={LAYER[n.layer].color} strokeWidth="1.5" opacity={0.7} />}
            </g>
          )
        })}
      </svg>

      {active
        ? <div className="stack" style={{ gap: 4 }}>
            <p className="t-micro" style={{ color: 'var(--color-text-tertiary)' }}>{LAYER[active.layer].label}</p>
            <p className="t-body t-quote">{active.content}</p>
            {active.tags.length > 0 && <p className="t-caption">{active.tags.map((t) => `#${t}`).join(' ')}</p>}
          </div>
        : <p className="t-caption">기억 {placed.length}개 · 점을 누르면 무엇을 기억하는지 보여요.</p>}
    </div>
  )
}
