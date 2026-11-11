/**
 * 캐릭터챗 한 응답을 화면의 덩어리로 나눈다 (2026-09-26).
 * 장면 서술(narrative·world)은 말풍선 밖에, 행동·속마음은 해당 인물의 대사와 같은 말풍선 안에 둔다.
 * 서술과 인물이 번갈아 오가면 말풍선도 번갈아 생긴다. index 는 응답 전체에서의 문단 순서 — 타이핑이 이 순서로 나타난다.
 */
import { parseEmphasis } from '@/components/scene/emphasis'

export type Paragraph = { text: string; kind: 'narration' | 'action' | 'thought' | 'dialogue'; index: number }
export type Segment = { kind: 'narration'; paragraphs: Paragraph[] } | { kind: 'bubble'; speaker: string; paragraphs: Paragraph[] }

/** `차유진 |"대사"` — 이름(20자 이하) + | + 따옴표 대사. */
const SPEECH_LINE = /^([^|\n"“]{1,20}?)\s*\|\s*["“](.*?)["”]?$/
const KINDS = new Set(['dialogue', 'action', 'narrative', 'npc', 'world', 'thought'])

export function segmentReply(blocks: Array<Record<string, unknown>>, content: string, name: string, cast: readonly string[] = []): Segment[] {
  const kept = blocks.filter((b) => KINDS.has(String(b.type)) && typeof b.text === 'string')
  const speakerOf = (b: Record<string, unknown>) => typeof b.speaker === 'string' && b.speaker.trim() ? b.speaker : null
  // 속마음은 늘 이 캐릭터의 것이다(검증기가 남의 속마음을 버린다). 그래서 속마음의 화자는 답을 쓸 때의 캐릭터 이름이다 —
  // 캐릭터 이름을 바꾼 뒤에도 옛 답의 행동·대사가 옛 이름의 말풍선으로 갈라지지 않는다.
  // 여러 인물 카드(11/6)의 히로인 속마음은 그 히로인 말풍선에 붙는다(cast = 히로인 이름).
  const heroines = new Set(cast)
  const self = new Set([name, ...kept.filter((b) => b.type === 'thought').map(speakerOf).filter((v): v is string => !!v && !heroines.has(v))])
  const items = kept.map((b) => {
    const type = String(b.type)
    const speaker = speakerOf(b)
    if (type === 'narrative' || type === 'world') return { text: String(b.text), kind: 'narration' as const, speaker: null }
    if (type === 'thought') return { text: String(b.text), kind: 'thought' as const, speaker: speaker && heroines.has(speaker) ? speaker : name }
    return { text: String(b.text), kind: type === 'action' ? 'action' as const : 'dialogue' as const, speaker: !speaker || self.has(speaker) ? name : speaker }
  })
  // 블록이 없는 옛 기록: 빈 줄로 나눈 문단, "이름:" 은 대사, 강조 파서가 기울임으로 읽는 별표로 시작하면 행동 —
  // 판정과 렌더가 같은 규칙을 쓴다(`*^^* 안녕` 은 별표째 보이는 대사).
  const source = items.length ? items : content.split(/\n\s*\n/).filter((t) => t.trim()).map((text) => {
    const prefix = `${name}:`
    const dialogue = text.startsWith(prefix)
    return { text: dialogue ? text.slice(prefix.length).trimStart() : text, kind: !dialogue && parseEmphasis(text)[0]?.style === 'italic' ? 'action' as const : 'dialogue' as const, speaker: name }
  })

  // 11/12 인트로 데이터는 서술 안에 `이름 |"대사"` 줄을 섞어 쓴다(베이비챗식). 그 줄은 대사 말풍선으로,
  // `나 |"…"`(주인공=사용자)는 이름표만 떼고 따옴표 대사로 서술에 남긴다.
  const expanded = source.flatMap((item) => {
    if (item.kind !== 'narration' || !item.text.includes('|')) return [item]
    const out: typeof source = []
    const prose = (text: string) => {
      const last = out[out.length - 1]
      if (last?.kind === 'narration') last.text += '\n' + text
      else out.push({ text, kind: 'narration', speaker: null })
    }
    for (const line of item.text.split('\n')) {
      const m = SPEECH_LINE.exec(line.trim())
      if (!m) { if (line.trim()) prose(line); continue }
      const [, who, said] = m as unknown as [string, string, string]
      if (who === '나') prose(`"${said}"`)
      else out.push({ text: said, kind: 'dialogue', speaker: self.has(who) ? name : who })
    }
    return out
  })

  const segments: Segment[] = []
  expanded.forEach((item, index) => {
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
