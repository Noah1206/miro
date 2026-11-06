import { taggedSpeech, voiceDelivery, type VoiceDelivery } from '@miro/config'

/** 소리 내어 읽을 글. 서술·속마음·NPC는 읽지 않는다. speech = 신음 태그가 든 음성용 대사(언베일, 화면엔 text). */
export const SPOKEN_MAX = 1200
export type SpokenSegment = { text: string; delivery: VoiceDelivery; speech?: string
  /** 여러 인물 카드에서 카드 이름이 아닌 히로인이 말한 줄(11/4) — 그 히로인 목소리로 읽는다. */
  speaker?: string }
/** 대사 화자가 목소리 목록의 어느 히로인인가 — 'speaker' 가 '벨제나 교수'처럼 이름 뒤에 호칭이 붙어도 맞춘다. */
export const matchSpeaker = (speaker: string, names: readonly string[]) => names.find(n => speaker === n || speaker.startsWith(n)) ?? null
/** speakers = 히로인별 목소리가 있는 이름(characters.ensemble_voices 의 키). 그 히로인 대사도 읽는다 — 서버와 화면이 같은 목록을 넘겨야 part 번호가 맞는다. */
export function spokenSegments(blocks: Array<Record<string, unknown>>, content: string, characterName?: string, speakers: readonly string[] = []): SpokenSegment[] {
  if (!blocks.length) return content.trim() ? [{ text: content.trim().slice(0, SPOKEN_MAX), delivery: voiceDelivery(null) }] : []
  const result: SpokenSegment[] = []
  let remaining = SPOKEN_MAX, whisper = false
  for (const block of blocks) {
    if (block.type === 'action' || block.type === 'narrative') {
      whisper = typeof block.text === 'string' && WHISPER_CUES.test(block.text)
      continue
    }
    if (block.type !== 'dialogue' || typeof block.text !== 'string') continue
    const speaker = typeof block.speaker === 'string' && block.speaker !== characterName ? block.speaker : null
    if (characterName && speaker && !matchSpeaker(speaker, speakers)) continue
    const text = block.text.trim().slice(0, remaining)
    const speech = text === block.text.trim() ? taggedSpeech(text, block.speech) : null
    if (text) { result.push({ text, delivery: voiceDelivery(block.delivery, whisper), ...(speech ? { speech } : {}), ...(speaker ? { speaker } : {}) }); remaining -= text.length }
    whisper = false
    if (!remaining) break
  }
  return result
}
export function spokenText(blocks: Array<Record<string, unknown>>, content: string): string {
  const lines = blocks.filter((b) => b.type === 'dialogue' && typeof b.text === 'string').map((b) => String(b.text).trim()).filter(Boolean)
  return (lines.length ? lines.join(' ') : blocks.length ? '' : content).replace(/\s+/g, ' ').trim().slice(0, SPOKEN_MAX)
}

/** 말투(10/21): 대사 주변 서술·행동·속마음에 속삭임 신호가 있으면 'whisper', 아니면 'normal'(보통 대화).
 *  합성 서버는 'normal' 이면 그 목소리의 보통 말 참조를, 없으면 기본 참조(지금은 속삭임)를 쓴다. */
const WHISPER_CUES = /속삭|귓가|귓속|귀에 대고|귀엣말|소곤|숨죽|목소리를 낮|낮게 읊|작게 말|작은 목소리/
export function spokenStyle(blocks: Array<Record<string, unknown>>): 'whisper' | 'normal' {
  return blocks.some((b) => b.type !== 'dialogue' && typeof b.text === 'string' && WHISPER_CUES.test(b.text)) ? 'whisper' : 'normal'
}

/**
 * 11/6: 한 대사를 문장 단위로 — 첫 문장만 먼저 만들어 바로 재생하고, 듣는 동안 다음 문장을 만든다(첫 소리까지 대사 전체 → 첫 문장 시간).
 * 너무 짧은 조각(12자 미만)은 다음 문장에 붙여 억양이 덜 끊기게. 괄호 지시([moaning] 등) 안에서는 나누지 않는다. 최대 20문장.
 */
export function speechSentences(text: string): string[] {
  const parts = text.split(/(?<=[.!?…~。！？])\s+(?![^\[]*\])/).map(s => s.trim()).filter(Boolean)
  const out: string[] = []
  let carry = ''
  for (const p of parts) {
    const joined = carry ? `${carry} ${p}` : p
    if (joined.replace(/\[[^\]]*\]/g, '').trim().length < 12) { carry = joined; continue }
    out.push(joined); carry = ''
  }
  if (carry) out.length ? (out[out.length - 1] += ` ${carry}`) : out.push(carry)
  if (out.length <= 20) return out
  return [...out.slice(0, 19), out.slice(19).join(' ')]
}
