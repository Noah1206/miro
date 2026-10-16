type Block = { type?: string; text: string; speaker?: string | null }
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

/** Flag only substantial recycled text, never a short greeting or a stable character dialect. */
export function repeatedConversationBlock(blocks: readonly Block[], recent: readonly Previous[], input = '', characterName?: string): number | null {
  if (REQUEST_REPEAT.test(input)) return null
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
      && !/기억(?:해|하)|잊지\s*마|remember/i.test(input)) return i
  }
  return null
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
