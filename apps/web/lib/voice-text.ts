import { taggedSpeech, voiceDelivery, type VoiceDelivery } from '@miro/config'

/** 소리 내어 읽을 글. 서술·속마음·NPC는 읽지 않는다. speech = 신음 태그가 든 음성용 대사(언베일, 화면엔 text). */
export const SPOKEN_MAX = 1200
export type SpokenSegment = { text: string; delivery: VoiceDelivery; speech?: string
  /** 여러 인물 카드에서 카드 이름이 아닌 히로인이 말한 줄(11/4) — 그 히로인 목소리로 읽는다. */
  speaker?: string
  /** 11/11 이 묶음에 든 대사 줄(화면 말풍선 문단) — 말풍선을 눌러 다시 들을 때 맞춘다. */
  lines: string[] }
/** 대사 화자가 목소리 목록의 어느 히로인인가 — 'speaker' 가 '벨제나 교수'처럼 이름 뒤에 호칭이 붙어도 맞춘다. */
export const matchSpeaker = (speaker: string, names: readonly string[]) => names.find(n => speaker === n || speaker.startsWith(n)) ?? null
/** 한 번에 합성하는 최대 글자 — 합성 서버 상한(600)보다 조금 작게. */
const MERGE_MAX = 500
/**
 * speakers = 히로인별 목소리가 있는 이름(characters.ensemble_voices 의 키). 서버와 화면이 같은 목록을 넘겨야 part 번호가 맞는다.
 * 11/11 사용자("한 문장마다 다른 사람 같다, 감정·억양이 엉망"): 대사 줄마다 따로 합성하면 줄마다 목소리 결·감정이 새로 시작된다 —
 * 같은 사람이 이어서 하는 말(사이의 서술·행동은 건너뜀)은 한 줄로 묶어 한 번에 합성한다. 감정·말투는 그 묶음의 첫 줄 것 하나.
 * 카드 이름으로 말한 줄이 없으면 가장 많이 말한 사람이 주인공이다(작품 제목이 카드 이름이고 대사 화자는 실명인 경우) — 그 사람은 카드 목소리.
 */
export function spokenSegments(blocks: Array<Record<string, unknown>>, content: string, characterName?: string, speakers: readonly string[] = []): SpokenSegment[] {
  if (!blocks.length) return content.trim() ? [{ text: content.trim().slice(0, SPOKEN_MAX), delivery: voiceDelivery(null), lines: [content.trim().slice(0, SPOKEN_MAX)] }] : []
  const lines: Array<{ text: string; speech: string | null; delivery: VoiceDelivery; speaker: string | null }> = []
  let remaining = SPOKEN_MAX, whisper = false
  for (const block of blocks) {
    if (block.type === 'action' || block.type === 'narrative') {
      whisper = typeof block.text === 'string' && WHISPER_CUES.test(block.text)
      continue
    }
    if (block.type !== 'dialogue' || typeof block.text !== 'string') continue
    const speaker = typeof block.speaker === 'string' && block.speaker !== characterName ? block.speaker : null
    // 11/10: 목록에 없는 인물도 건너뛰지 않는다(사용자: 안 끊기게) — 목소리는 segmentVoice 가 정한다.
    if (speaker && /^(나|당신|유저|사용자|user)$/i.test(speaker.trim())) continue   // 유저 몫의 대사는 읽지 않는다
    const text = block.text.trim().slice(0, remaining)
    const speech = text === block.text.trim() ? taggedSpeech(text, block.speech) : null
    if (text) { lines.push({ text, speech, delivery: voiceDelivery(block.delivery, whisper), speaker }); remaining -= text.length }
    whisper = false
    if (!remaining) break
  }
  // 주인공 정하기 — 카드 이름(또는 화자 없음) 줄이 없으면, 목록에 없는 화자 가운데 가장 많이 말한 사람을 주인공으로 본다.
  if (!lines.some(l => l.speaker === null)) {
    const counts = new Map<string, number>()
    for (const l of lines) if (l.speaker && !matchSpeaker(l.speaker, speakers)) counts.set(l.speaker, (counts.get(l.speaker) ?? 0) + 1)
    const lead = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0]
    if (lead) for (const l of lines) if (l.speaker === lead) l.speaker = null
  }
  const result: SpokenSegment[] = []
  for (const l of lines) {
    const last = result.at(-1)
    if (last && (last.speaker ?? null) === l.speaker && last.text.length + 1 + l.text.length <= MERGE_MAX) {
      const prevText = last.text, prevSpeech = last.speech
      last.text = prevText + ' ' + l.text
      if (prevSpeech !== undefined || l.speech) last.speech = (prevSpeech ?? prevText) + ' ' + (l.speech ?? l.text)
      last.lines.push(l.text)
      last.delivery = { ...last.delivery, pauseAfterMs: l.delivery.pauseAfterMs }
      continue
    }
    result.push({ text: l.text, delivery: l.delivery, lines: [l.text], ...(l.speech ? { speech: l.speech } : {}), ...(l.speaker ? { speaker: l.speaker } : {}) })
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

if (process.argv[1]?.endsWith('voice-text.ts')) {
  // 같은 사람의 줄은 하나로, 화자가 바뀌면 나뉜다. 카드 이름 줄이 없으면 가장 많이 말한 사람이 주인공(speaker 없음).
  const segs = spokenSegments([{ type: 'dialogue', speaker: '예린', text: '가.' }, { type: 'action', text: '돌아선다.' }, { type: 'dialogue', speaker: '예린', text: '빨리.' },
    { type: 'dialogue', speaker: '민수', text: '어디 가?' }, { type: 'dialogue', speaker: '예린', text: '몰라.' }], '', '카드 제목')
  console.assert(segs.length === 3 && segs[0]!.text === '가. 빨리.' && segs[0]!.speaker === undefined && segs[1]!.speaker === '민수' && segs[0]!.lines.length === 2, JSON.stringify(segs))
}
