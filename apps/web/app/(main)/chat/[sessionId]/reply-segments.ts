/**
 * 캐릭터챗 한 응답을 화면의 덩어리로 나눈다 (2026-09-26).
 * 장면 서술(narrative·world)은 말풍선 밖에 한 줄 아이콘과 함께, 인물의 행동·속마음·대사는 그 인물의 말풍선 안에 둔다.
 * 서술과 인물이 번갈아 오가면 말풍선도 번갈아 생긴다. index 는 응답 전체에서의 문단 순서 — 타이핑이 이 순서로 나타난다.
 */
export type Paragraph = { text: string; kind: 'narration' | 'action' | 'thought' | 'dialogue'; index: number }
export type Segment = { kind: 'narration'; paragraphs: Paragraph[] } | { kind: 'bubble'; speaker: string; paragraphs: Paragraph[] }

const KINDS = new Set(['dialogue', 'action', 'narrative', 'npc', 'world', 'thought'])

export function segmentReply(blocks: Array<Record<string, unknown>>, content: string, name: string): Segment[] {
  const kept = blocks.filter((b) => KINDS.has(String(b.type)) && typeof b.text === 'string')
  const speakerOf = (b: Record<string, unknown>) => typeof b.speaker === 'string' && b.speaker.trim() ? b.speaker : null
  // 속마음은 늘 이 캐릭터의 것이다(검증기가 남의 속마음을 버린다). 그래서 속마음의 화자는 답을 쓸 때의 캐릭터 이름이다 —
  // 캐릭터 이름을 바꾼 뒤에도 옛 답의 행동·대사가 옛 이름의 말풍선으로 갈라지지 않는다.
  const self = new Set([name, ...kept.filter((b) => b.type === 'thought').map(speakerOf).filter((v): v is string => !!v)])
  const items = kept.map((b) => {
    const type = String(b.type)
    const speaker = speakerOf(b)
    if (type === 'narrative' || type === 'world') return { text: String(b.text), kind: 'narration' as const, speaker: null }
    if (type === 'thought') return { text: String(b.text), kind: 'thought' as const, speaker: name }
    return { text: String(b.text), kind: type === 'action' ? 'action' as const : 'dialogue' as const, speaker: !speaker || self.has(speaker) ? name : speaker }
  })
  // 블록이 없는 옛 기록: 빈 줄로 나눈 문단, "이름:" 은 대사, *로 시작하면 행동.
  const source = items.length ? items : content.split(/\n\s*\n/).filter((t) => t.trim()).map((text) => {
    const prefix = `${name}:`
    const dialogue = text.startsWith(prefix)
    return { text: dialogue ? text.slice(prefix.length).trimStart() : text, kind: !dialogue && /^\*[^*]/.test(text) ? 'action' as const : 'dialogue' as const, speaker: name }
  })

  const segments: Segment[] = []
  source.forEach((item, index) => {
    const paragraph: Paragraph = { text: item.text, kind: item.kind, index }
    const last = segments[segments.length - 1]
    if (item.kind === 'narration') {
      if (last?.kind === 'narration') last.paragraphs.push(paragraph)
      else segments.push({ kind: 'narration', paragraphs: [paragraph] })
      return
    }
    const speaker = item.speaker ?? name
    if (last?.kind === 'bubble' && last.speaker === speaker) last.paragraphs.push(paragraph)
    else segments.push({ kind: 'bubble', speaker, paragraphs: [paragraph] })
  })
  return segments
}
