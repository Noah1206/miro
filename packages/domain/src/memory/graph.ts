import type { Memory } from './types'
import { layerOf, terms, type MemoryLayer } from './layers'

export type MemoryNode = {
  id: string
  content: string
  layer: MemoryLayer
  tags: string[]
  /** 노드 크기. importance × persistence. */
  weight: number
  createdAt: Date
}
export type MemoryEdge = { source: string; target: string; tags: string[]; weight: number }
export type MemoryGraph = { nodes: MemoryNode[]; edges: MemoryEdge[]; tags: Array<{ tag: string; count: number }> }

/** 내부 상태는 화면에 올리지 않는다 — 요약 캐시는 그래프의 노드가 아니다. */
const HIDDEN = new Set(['short_term_summary'])

/**
 * 태그가 비어 있는 기억(태그 도입 이전 기록, 규칙이 만든 기억)의 대체 태그.
 * 검색이 쓰는 것과 같은 낱말 조각이라 검색과 그래프가 같은 기준으로 움직인다.
 */
export function tagsOf(m: Pick<Memory, 'content' | 'tags'>): string[] {
  const given = (m.tags ?? []).map((t) => t.trim().toLowerCase()).filter(Boolean)
  return [...new Set(given.length ? given : terms(m.content).slice(0, 4))]
}

/**
 * 기억 그래프 — 태그를 공유하는 기억끼리 잇는다. 엣지 표를 따로 두지 않는다.
 * 세션 격리는 호출자를 믿지 않고 여기서 한 번 더 강제한다.
 */
export function buildMemoryGraph(memories: Memory[], sessionId: string): MemoryGraph {
  const scoped = memories.filter((m) => m.sessionId === sessionId && !HIDDEN.has(m.type))
  const nodes: MemoryNode[] = scoped.map((m) => ({
    id: m.id, content: m.content, layer: layerOf(m.type), tags: tagsOf(m),
    weight: m.importance * m.persistence, createdAt: m.createdAt,
  }))

  const byTag = new Map<string, MemoryNode[]>()
  for (const n of nodes) for (const t of n.tags) byTag.set(t, [...(byTag.get(t) ?? []), n])

  // 같은 태그를 가진 기억끼리 잇고, 같은 쌍은 공유 태그 수만큼 굵어진다.
  const pairs = new Map<string, MemoryEdge>()
  for (const [tag, group] of byTag) {
    if (group.length < 2) continue
    for (let i = 0; i < group.length; i++) for (let j = i + 1; j < group.length; j++) {
      const [a, b] = group[i]!.id < group[j]!.id ? [group[i]!, group[j]!] : [group[j]!, group[i]!]
      const key = `${a.id} ${b.id}`
      const found = pairs.get(key)
      if (found) { found.tags.push(tag); found.weight = found.tags.length }
      else pairs.set(key, { source: a.id, target: b.id, tags: [tag], weight: 1 })
    }
  }

  const tags = [...byTag.entries()].map(([tag, group]) => ({ tag, count: group.length }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
  return { nodes, edges: [...pairs.values()], tags }
}
