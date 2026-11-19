import { RpBlock, type SimulationProposal } from './proposal.schema'
import { allowedBlocks, sceneImages } from './validator'
import type { SimulationSnapshot } from './context'

export type StreamBlock = SimulationProposal['rp']['blocks'][number]
/** 11/20 스트리밍 중 상황 사진 — index: 상황 사진 순번, after: 그 사진이 들어갈 자리(보이는 블록 몇 개 뒤, null = 답 끝). url 은 웹이 채운다. */
export type StreamPhoto = { index: number; after: number | null; url?: string }
/** 대사 스트리밍(10/9)을 받는 쪽 — 지금까지 다 닫힌 블록 전체, 그리고 새 시도가 시작돼 앞에서 보여 준 것을 지워야 할 때. */
export type TurnStream = { onBlocks(blocks: StreamBlock[]): void; onReset(): void; onFirstText?(): void; onPhotos?(photos: StreamPhoto[]): void }

/** 11/20 AI 가 rp 앞에 먼저 쓴 images 배열(다 닫혔을 때만) — 코드 목록. 아직 없으면 null. */
function earlyImageCodes(text: string): string[] | null {
  const m = /"images"\s*:\s*\[([^\]]*)\]/.exec(text)
  return m ? [...m[1]!.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map(x => x[1]!) : null
}

/**
 * 아직 다 오지 않은 대사 JSON 에서 rp.blocks 의 다 닫힌 항목만 꺼낸다. 문자열 안의 괄호는 세지 않는다.
 * 대사 계약은 rp.blocks 를 맨 앞에 두므로 블록이 상태 칸보다 먼저 온다.
 */
export function completedBlocks(text: string): unknown[] {
  return scanBlocks(text).done
}

/**
 * 11/19 지금 쓰는 중인(아직 안 닫힌) 블록 — 다 닫힌 블록만 보이면 첫 문단이 끝날 때까지(실측 중간 2초 더) 빈 화면이라, 쓰는 중인 글도 내보낸다.
 * type·speaker 는 다 쓴 것만, text 는 지금까지 온 데까지. 못 읽으면 null.
 */
export function openBlock(text: string): Record<string, unknown> | null {
  const frag = scanBlocks(text).open
  if (!frag) return null
  const field = (k: string) => new RegExp(`"${k}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`).exec(frag)?.[1]
  const raw = /"text"\s*:\s*"((?:[^"\\]|\\.)*)/.exec(frag)?.[1]
  const type = field('type')
  if (!type || raw === undefined) return null
  try {
    const decode = (v: string) => JSON.parse(`"${v.replace(/\\(u[0-9a-fA-F]{0,3})?$/, '')}"`) as string
    const speaker = field('speaker')
    const out: Record<string, unknown> = { type, text: decode(raw) }
    if (speaker !== undefined) out.speaker = decode(speaker)
    return out
  } catch { return null }
}

function scanBlocks(text: string): { done: unknown[]; open: string | null } {
  const key = text.search(/"blocks"\s*:\s*\[/)
  if (key < 0) return { done: [], open: null }
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
    } else if (ch === ']' && depth === 0) return { done: out, open: null }
  }
  return { done: out, open: depth > 0 && start >= 0 ? text.slice(start) : null }
}

/**
 * generateStructured 에 넘길 onText/onAttempt. 다 닫히고, 블록 스키마(내부 수치 노출 금지 포함)와 화자 규칙을 통과한 블록만,
 * 늘었을 때만 넘긴다. 아직 검증 전 답이다 — 최종본은 저장 뒤에 따로 간다. dropWorld: 자율성 경로는 npc·world 블록을 걷어 낸다.
 */
export function blockStream(snapshot: SimulationSnapshot, stream: TurnStream, opts: { dropWorld?: boolean } = {}) {
  let shown = 0, started = false, openLen = 0, openAt = 0, picks: ReturnType<typeof sceneImages> | null = null, sentPhotos = ''
  const keep = (b: StreamBlock) => !opts.dropWorld || (b.type !== 'npc' && b.type !== 'world')
  // 11/20 사용자: 사진은 글이 그 자리에 왔을 때 바로 — AI 가 rp 앞에 고른 사진을, 자리를 알 수 있게 된 것부터 보낸다(자리 계산은 검증기와 같은 규칙).
  const photos = (parsed: StreamBlock[]) => {
    if (!picks || !stream.onPhotos) return
    const out: StreamPhoto[] = []
    for (const p of picks) {
      if (p.fill || p.after === null) { out.push({ index: p.index, after: p.after }); continue }
      if (parsed.length < p.after) continue   // 아직 그 블록까지 안 왔다
      const kept = allowedBlocks(parsed.slice(0, p.after), snapshot).length
      out.push({ index: p.index, after: kept >= 1 ? kept : null })
    }
    const key = JSON.stringify(out)
    if (key !== sentPhotos) { sentPhotos = key; stream.onPhotos(out) }
  }
  return {
    onAttempt() { if (shown || openLen) stream.onReset(); shown = 0; openLen = 0; picks = null; sentPhotos = '' },
    onText(text: string) {
      if (!started && text) { started = true; stream.onFirstText?.() }
      const parsed = completedBlocks(text).flatMap(raw => { const r = RpBlock.safeParse(raw); return r.success ? [r.data] : [] }).filter(keep)
      if (!picks && stream.onPhotos) { const codes = earlyImageCodes(text); if (codes) picks = sceneImages(snapshot, codes) }
      photos(parsed)
      const blocks = allowedBlocks(parsed, snapshot)
      // 11/19 쓰는 중인 블록도 붙인다(partial 표시, 화면은 늘어나는 대로 이어 친다). 글이 늘었을 때만, 120ms 에 한 번 — 매 조각마다 전체를 보내지 않게.
      const raw = openBlock(text), open = raw && typeof raw.text === 'string' && raw.text.trim() ? RpBlock.safeParse(raw) : null
      const withOpen = open?.success && keep(open.data) ? allowedBlocks([...parsed, open.data], snapshot) : null
      const partial = withOpen && withOpen.length === blocks.length + 1 ? { ...withOpen.at(-1)!, partial: true } as StreamBlock : null
      const len = partial ? partial.text.length : 0, now = Date.now()
      if (blocks.length > shown || (partial && len > openLen && now - openAt >= 120)) {
        shown = blocks.length; openLen = len; openAt = now
        stream.onBlocks(partial ? [...blocks, partial] : blocks)
      }
    },
  }
}
