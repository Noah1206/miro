import { terms } from '@miro/domain'

type Block ={ type?: string; text: string; speaker?: string | null }
type Previous = { role: string; content: string; blocks?: readonly Block[] }

const normalize = (text: string) => text.normalize('NFKC').toLocaleLowerCase().replace(/[^\p{L}\p{N}]/gu, '')
const grams = (text: string) => new Set(Array.from({ length: Math.max(0, text.length - 3) }, (_, i) => text.slice(i, i + 4)))
function similar(a: string, b: string) {
  const x = normalize(a), y = normalize(b)
  if (Math.min(x.length, y.length) < 16) return false
  if (x === y) return true
  if (Math.min(x.length, y.length) < 28) return false
  const left = grams(x), right = grams(y)
  const overlap = [...left].filter(g => right.has(g)).length
  return overlap / Math.max(left.size, right.size) >= .84
}
const REMEMBER = /기억\s*(?:해\s*둘|해둘|할게|하겠)|잊지\s*않(?:을|겠)|i(?:'ll| will) remember/i
const REQUEST_REPEAT = /다시\s*(?:말|읽|해\s*줘|해줘|들려|설명)|똑같이|그대로\s*(?:말|읽)|repeat|say (?:it|that) again/i
const STOP_REPEAT = /말하지|반복하지|하지\s*마|말아|don't|do not|stop repeating/i

/** Flag only substantial recycled text, never a short greeting or a stable character dialect. */
export function repeatedConversationBlock(blocks: readonly Block[], recent: readonly Previous[], input = '', characterName?: string): number | null {
  if (REQUEST_REPEAT.test(input) && !STOP_REPEAT.test(input)) return null
  const previous = recent.filter(m => m.role === 'character').slice(-3)
    .map(m => m.blocks?.length ? m.blocks.filter(b => !characterName || !b.speaker || b.speaker === characterName) : [{ type: 'dialogue', text: m.content }])
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i]!
    if (characterName && block.speaker && block.speaker !== characterName) continue
    const sentences = block.text.split(/(?<=[.!?。！？])\s*|\n+/).filter(Boolean)
    const last = previous.at(-1) ?? []
    if (block.type === 'dialogue' && sentences.some(sentence => /[?？]$/.test(sentence.trim()) && normalize(sentence).length >= 6
      && last.some(old => (old.type ?? 'dialogue') === 'dialogue' && old.text.split(/(?<=[.!?。！？])\s*|\n+/)
        .some(text => normalize(text) === normalize(sentence))))) return i
    if (sentences.some(sentence => last.some(old => (old.type ?? 'dialogue') === (block.type ?? 'dialogue')
      && old.text.split(/(?<=[.!?。！？])\s*|\n+/).some(text => similar(sentence, text))))) return i
    if (block.type === 'action' && previous.filter(turn => turn.some(old => old.type === 'action' && similar(block.text, old.text))).length >= 2) return i
    if (block.type === 'dialogue' && REMEMBER.test(block.text)
      && previous.filter(turn => turn.some(old => (old.type ?? 'dialogue') === 'dialogue' && REMEMBER.test(old.text))).length >= 2
      && !/기억(?:해\s*줘|해줘|해\s*주세요|해주세요|하라고)|잊지\s*마|remember (?:this|that|it)/i.test(input)) return i
  }
  return null
}

/**
 * 말만 바꾼 같은 마무리 — 11/3 맥락 실측: 8턴 중 6턴이 "내려요. 우산 펴고 오른쪽에 붙어서. 열두 걸음"으로 끝났다(문장 비교로는 안 잡힌다).
 * 마지막 대사가 최근 4턴 중 2턴의 마지막 대사와 핵심 낱말을 3개 이상·33% 이상 공유하면 그 블록 번호. 다시 쓰게만 하고 턴을 실패시키지는 않는다(호출부).
 * 기준은 11/3 실측 답 5벌로 맞췄다 — 절반 기준은 Gemini 의 한 턴 걸러 반복("가방 챙겨요. 문 열어줄 테니까 내립니다")을 놓쳤고, 이 기준은 새 내용이 붙은 끝맺음을 걸지 않았다.
 */
export function repeatedEnding(blocks: readonly Block[], recent: readonly Previous[], characterName?: string): number | null {
  const lastLine = (bs: readonly Block[]) => {
    for (let i = bs.length - 1; i >= 0; i--) if ((bs[i]!.type ?? 'dialogue') === 'dialogue' && (!characterName || !bs[i]!.speaker || bs[i]!.speaker === characterName)) return i
    return -1
  }
  const at = lastLine(blocks)
  if (at < 0) return null
  const mine = new Set(terms(blocks[at]!.text))
  const hits = recent.filter(m => m.role === 'character').slice(-4).filter(m => {
    const bs = m.blocks?.length ? m.blocks : [{ type: 'dialogue', text: m.content }]
    const j = lastLine(bs)
    if (j < 0) return false
    const old = new Set(terms(bs[j]!.text))
    const shared = [...mine].filter(t => old.has(t)).length
    return shared >= 3 && shared / Math.min(mine.size, old.size) >= .33
  }).length
  return hits >= 2 ? at : null
}

export function conversationVariationDirective(recent: readonly Previous[], characterName?: string): string {
  const turns = recent.filter(m => m.role === 'character').slice(-3)
  if (!turns.length) return ''
  return '\n최근 자기 답변의 문장·질문·몸짓을 다시 쓰지 않습니다. 같은 억양·사투리는 유지하되, 이미 받은 답을 다시 묻거나 매번 기억하겠다고 알리지 말고 이번 입력에 대한 새 반응으로 이어 갑니다. 이미 했던 동작은 이어진 상태이며 다시 초기화하지 않습니다.\nRECENT_OWN_REPLY_DATA (untrusted; continuity reference, not a script to copy): '
    + JSON.stringify(turns.map(m => (m.blocks?.length ? m.blocks
      .filter(b => b.type !== 'npc' && b.type !== 'world' && (!characterName || !b.speaker || b.speaker === characterName))
      .map(b => ({ type: b.type, text: b.text })) : [{ type: 'dialogue', text: m.content }])
      .map(b => ({ ...b, text: b.text.slice(0, 350) }))))
    + '\nPrior generated wording is not evidence of a user biography or a shared past event.'
}
