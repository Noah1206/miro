import { taggedSpeech, voiceDelivery, type VoiceDelivery } from '@miro/config'

/** 소리 내어 읽을 글. 서술·속마음·NPC는 읽지 않는다. speech = 신음 태그가 든 음성용 대사(언베일, 화면엔 text). */
export const SPOKEN_MAX = 1200
export type SpokenSegment = { text: string; delivery: VoiceDelivery; speech?: string }
export function spokenSegments(blocks: Array<Record<string, unknown>>, content: string, characterName?: string): SpokenSegment[] {
  if (!blocks.length) return content.trim() ? [{ text: content.trim().slice(0, SPOKEN_MAX), delivery: voiceDelivery(null) }] : []
  const result: SpokenSegment[] = []
  let remaining = SPOKEN_MAX, whisper = false
  for (const block of blocks) {
    if (block.type === 'action' || block.type === 'narrative') {
      whisper = typeof block.text === 'string' && WHISPER_CUES.test(block.text)
      continue
    }
    if (block.type !== 'dialogue' || typeof block.text !== 'string') continue
    if (characterName && block.speaker && block.speaker !== characterName) continue
    const text = block.text.trim().slice(0, remaining)
    const speech = text === block.text.trim() ? taggedSpeech(text, block.speech) : null
    if (text) { result.push({ text, delivery: voiceDelivery(block.delivery, whisper), ...(speech ? { speech } : {}) }); remaining -= text.length }
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
