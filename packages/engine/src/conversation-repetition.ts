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

const SENTENCES = /(?<=[.!?。！？…])\s*|\n+/
const ASK = /몇\s*시|몇\s*분|언제|어디|누구|무엇|뭐(?:야|예요|에요|지|하|를|가)?|왜|어떻게|얼마/
const isQuestion = (s: string) => /[?？]\s*$/.test(s.trim()) || /(?:니까|나요|가요|래요|ㄹ까|을까|할까|는지)\s*[.?？]?\s*$/.test(s.trim())
const ownBlocks = (m: Previous, characterName?: string) => (m.blocks?.length ? m.blocks : [{ type: 'dialogue', text: m.content }])
  .filter(b => !characterName || !b.speaker || b.speaker === characterName)

/**
 * 말만 바꾼 같은 질문(11/4 벌점 실측: 단답 3턴 연속 "내일 몇 시에 출근합니까?" → "몇 시에 문 열고 나옵니까" → "몇 시 몇 분에 나옵니까").
 * 문장 비교로는 안 잡힌다 — 같은 의문사(몇 시·언제·어디…)에 핵심 낱말 하나 이상을 최근 3턴의 질문과 공유하면 그 블록 번호. 다시 쓰게만 한다.
 */
export function repeatedQuestion(blocks: readonly Block[], recent: readonly Previous[], characterName?: string): number | null {
  const asked = recent.filter(m => m.role === 'character').slice(-3).flatMap(m => ownBlocks(m, characterName))
    .filter(b => (b.type ?? 'dialogue') === 'dialogue').flatMap(b => b.text.split(SENTENCES)).filter(isQuestion)
  if (!asked.length) return null
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i]!
    if ((b.type ?? 'dialogue') !== 'dialogue' || (characterName && b.speaker && b.speaker !== characterName)) continue
    for (const q of b.text.split(SENTENCES).filter(isQuestion)) {
      const w = ASK.exec(q)?.[0]?.replace(/\s/g, '')
      if (!w) continue
      const mine = new Set(terms(q))
      if (asked.some(old => ASK.exec(old)?.[0]?.replace(/\s/g, '') === w && terms(old).some(t => t.length >= 2 && mine.has(t)))) return i
    }
  }
  return null
}

/** 상투 표현 — 벌점표 [-2]. 들어간 서술·행동 문장은 지운다. */
const STOCK = /심장이\s*(?:쿵|철렁|덜컥)|숨이\s*멎|눈빛이\s*깊어|입꼬리가?\s*(?:올라|말려|씰룩|희미하게)|느른한\s*(?:미소|호|입꼬리)|가슴이\s*(?:두근|쿵|저릿)|시간이\s*멈춘\s*(?:듯|것)/
/** 매 턴 되풀이되는 몸짓·소품 낱말 — 최근 턴의 서술·행동에 나온 이 낱말이 또 나오면 그 문장을 지운다. */
const MOTIF = ['입꼬리', '미소', '눈썹', '눈매', '시선', '한숨', '턱', '손목', '시계', '장갑', '어깨', '입술', '머리카락', '귀끝', '앞머리', '안경', '담배', '넥타이', '소매']

/**
 * 벌점 문장 지우기(11/4) — 서술(narrative)·행동(action)에서 상투 표현이나 최근 턴마다 되풀이된 몸짓·소품 문장을 뺀다. 대사는 건드리지 않는다.
 * 블록에 다른 문장이 남을 때만 지우고(빈 블록·말 끊김 방지), 한 블록이 통째로 그 문장뿐이면 그 블록만 뺀다 — 대사가 하나도 없게 되는 경우엔 손대지 않는다.
 */
export function trimPenalizedSentences<T extends Block>(blocks: readonly T[], recent: readonly Previous[], characterName?: string): T[] {
  const prev = recent.filter(m => m.role === 'character').slice(-3).map(m => ownBlocks(m, characterName)
    .filter(b => b.type === 'narrative' || b.type === 'action').map(b => b.text).join(' '))
  // 바로 앞 턴에 나왔거나 최근 3턴 중 2턴에 나온 낱말 — 연달아 나오는 것과 한 턴 걸러 되풀이되는 것을 함께 막는다(11/4 실측: 장갑이 한 턴 걸러 6/14턴).
  const tired = new Set(MOTIF.filter(w => prev.at(-1)?.includes(w) || prev.filter(t => t.includes(w)).length >= 2))
  const bad = (s: string) => STOCK.test(s) || [...tired].some(w => s.includes(w))
  const out = blocks.flatMap(b => {
    if (b.type !== 'narrative' && b.type !== 'action') return [b]
    const parts = b.text.split(/(?<=[.!?。！？…])\s+/)
    const kept = parts.filter(s => !bad(s))
    if (kept.length === parts.length) return [b]
    return kept.length ? [{ ...b, text: kept.join(' ') }] : []
  })
  const hasTalk = (bs: readonly T[]) => bs.some(b => (b.type ?? 'dialogue') === 'dialogue')
  return out.length && (hasTalk(out) || !hasTalk(blocks)) ? out : [...blocks]
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

/**
 * 11/11 언베일 장면의 되풀이 거부 — 직전 답에서 막는 대사("손 치우세요·여기서는 안 돼요·그만해요")를 했는데 이번에도 또 막으면 그 블록 번호.
 * 지시만으로는 Grok 이 앞 턴의 거부 흐름을 버리지 못했다(사용자: 베이비챗처럼 원하는 대로 진행). 호출부는 언베일 턴에서만, 다시 쓰게만 한다.
 */
const REFUSAL = /치우세요|치워\s*(?:요|줘|주세요)|그만(?:둬|해|하세요|둬요|해요|하라고)|안\s*돼(?:요)?[.!…~]|하지\s*마(?:세요|요)?|나가\s*주세요|여기서는|여기서\s*(?:하면|그러지|이러지)|놔\s*(?:요|줘|주세요)|멈춰|싫어(?:요)?[.!…]|그만하시|풀으시|놓으시|거두시|아니\s*되옵|안\s*되옵|이러시면|처소로|물러(?:나|서)/
export function repeatedRefusal(blocks: readonly Block[], recent: readonly Previous[], characterName?: string): number | null {
  const mine = (b: { type?: string; speaker?: string | null }) => (b.type ?? 'dialogue') === 'dialogue' && (!characterName || !b.speaker || b.speaker === characterName)
  const last = recent.filter(m => m.role === 'character').at(-1)
  const lastBlocks = last ? (last.blocks?.length ? last.blocks : [{ type: 'dialogue', text: last.content }]) : []
  if (!lastBlocks.some(b => mine(b) && REFUSAL.test(b.text))) return null
  const i = blocks.findIndex(b => mine(b) && REFUSAL.test(b.text))
  return i >= 0 ? i : null
}
