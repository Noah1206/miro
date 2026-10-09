import { RpBlock, type SimulationProposal } from './proposal.schema'
import { allowedBlocks } from './validator'
import type { SimulationSnapshot } from './context'

export type StreamBlock = SimulationProposal['rp']['blocks'][number]
/** 대사 스트리밍(10/9)을 받는 쪽 — 지금까지 다 닫힌 블록 전체, 그리고 새 시도가 시작돼 앞에서 보여 준 것을 지워야 할 때. */
export type TurnStream = { onBlocks(blocks: StreamBlock[]): void; onReset(): void }

/**
 * 아직 다 오지 않은 대사 JSON 에서 rp.blocks 의 다 닫힌 항목만 꺼낸다. 문자열 안의 괄호는 세지 않는다.
 * 대사 계약은 rp.blocks 를 맨 앞에 두므로 블록이 상태 칸보다 먼저 온다.
 */
export function completedBlocks(text: string): unknown[] {
  const key = text.search(/"blocks"\s*:\s*\[/)
  if (key < 0) return []
  const out: unknown[] = []
  let depth = 0, start = -1, inString = false, escaped = false
  for (let i = text.indexOf('[', key) + 1; i < text.length; i++) {
    const ch = text[i]
    if (inString) {
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') inString = true
    else if (ch === '{') { if (depth++ === 0) start = i }
    else if (ch === '}' && --depth === 0 && start >= 0) {
      try { out.push(JSON.parse(text.slice(start, i + 1))) } catch { /* 깨진 항목은 최종 검증이 판단한다 */ }
      start = -1
    } else if (ch === ']' && depth === 0) break
  }
  return out
}

/**
 * generateStructured 에 넘길 onText/onAttempt. 다 닫히고, 블록 스키마(내부 수치 노출 금지 포함)와 화자 규칙을 통과한 블록만,
 * 늘었을 때만 넘긴다. 아직 검증 전 답이다 — 최종본은 저장 뒤에 따로 간다. dropWorld: 자율성 경로는 npc·world 블록을 걷어 낸다.
 */
export function blockStream(snapshot: SimulationSnapshot, stream: TurnStream, opts: { dropWorld?: boolean } = {}) {
  let shown = 0
  return {
    onAttempt() { if (shown) stream.onReset(); shown = 0 },
    onText(text: string) {
      const parsed = completedBlocks(text).flatMap(raw => { const r = RpBlock.safeParse(raw); return r.success ? [r.data] : [] })
        .filter(b => !opts.dropWorld || (b.type !== 'npc' && b.type !== 'world'))
      const blocks = allowedBlocks(parsed, snapshot)
      if (blocks.length > shown) { shown = blocks.length; stream.onBlocks(blocks) }
    },
  }
}
