/** 11/9 결말 표식 — AI 가 결말이 난 장면의 마지막 서술 블록에 '— ENDING · 이름 —' 을 쓴다. 대시·띄어쓰기·가운뎃점이 조금 달라도 받는다. */
const ENDING = /^\s*[—–\-―]+\s*ENDING\s*[·•∙・:|\-]\s*(.+?)\s*[—–\-―]+\s*$/i

/** 블록 가운데 결말 표식의 결말 이름. 없으면 null. */
export function endingTitle(blocks: unknown): string | null {
  if (!Array.isArray(blocks)) return null
  for (const b of blocks as Array<{ text?: unknown }>) {
    const hit = typeof b?.text === 'string' ? ENDING.exec(b.text) : null
    if (hit?.[1]) return hit[1].slice(0, 80)
  }
  return null
}
