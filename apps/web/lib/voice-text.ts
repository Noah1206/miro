/** 소리 내어 읽을 글(몰입 모드). 대사만 — 속마음은 "소리 내어 말하지 않음", 서술·행동은 화면으로 본다. 블록이 없으면 본문. */
export const SPOKEN_MAX = 1200
export function spokenText(blocks: Array<Record<string, unknown>>, content: string): string {
  const lines = blocks.filter((b) => b.type === 'dialogue' && typeof b.text === 'string').map((b) => String(b.text).trim()).filter(Boolean)
  return (lines.length ? lines.join(' ') : blocks.length ? '' : content).replace(/\s+/g, ' ').trim().slice(0, SPOKEN_MAX)
}
