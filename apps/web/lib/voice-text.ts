/** 소리 내어 읽을 글(몰입 모드). 대사만 — 속마음은 "소리 내어 말하지 않음", 서술·행동은 화면으로 본다. 블록이 없으면 본문. */
export const SPOKEN_MAX = 1200
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
