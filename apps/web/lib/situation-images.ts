import { z } from 'zod'
import { selectLore } from '@miro/domain'
import type { LLMProvider } from '@miro/providers'

/**
 * 상황별 사진(10/28) — 만든 사람이 사진마다 상황을 적어 두면, 그 상황이 된 순간 사진을 채팅에 한 번 띄운다.
 * 10/31 사용자 고정 요구: 키워드 일치만이 아니라 AI 가 만든 사람이 적은 상황(situation)을 보고 고른다.
 * 키워드는 남겨 둔다 — AI 호출이 실패하거나 상황 설명이 없는 옛 사진은 키워드로 찾는다(로어북과 같은 규칙, 조사 붙어도 찾음).
 */
/** adult: 언베일(성인 모드)이 켜진 턴에만 후보가 된다(11/2) — 일반 대화에는 뜨지 않는다. */
export type SituationImage = { keywords: string[]; image: string; situation?: string; adult?: true }
// 11/18 100→1000장 — 대화 지시문에는 지금 대화와 가까운 30장만 싣는다(engine relevantSituationImages).
export const SITUATION_LIMITS = { entries: 1000, keywords: 5, keywordLength: 20, situationLength: 120 } as const

/** 폼 JSON → 저장할 목록. 상황 설명도 키워드도 없는 줄·https 가 아닌 사진은 버린다. */
export function normalizeSituationImages(input: unknown): SituationImage[] {
  if (!Array.isArray(input)) return []
  return input.flatMap((raw) => {
    const o = (raw ?? {}) as { keywords?: unknown; image?: unknown; situation?: unknown; adult?: unknown }
    const image = typeof o.image === 'string' && o.image.startsWith('https://') ? o.image : ''
    const keywords = Array.isArray(o.keywords)
      ? [...new Set(o.keywords.filter((k): k is string => typeof k === 'string').map(k => k.trim().slice(0, SITUATION_LIMITS.keywordLength)).filter(Boolean))].slice(0, SITUATION_LIMITS.keywords)
      : []
    const situation = typeof o.situation === 'string' ? o.situation.replace(/\s+/g, ' ').trim().slice(0, SITUATION_LIMITS.situationLength) : ''
    return image && (keywords.length || situation) ? [{ keywords, image, ...(situation ? { situation } : {}), ...(o.adult === true ? { adult: true as const } : {}) }] : []
  }).slice(0, SITUATION_LIMITS.entries)
}

/** 키워드로만 고르기 — 이번 턴(사용자 말 + 캐릭터 답)에 키워드가 나온 사진 하나. 이미 띄운 사진은 다시 고르지 않는다. */
export function pickSituationImage(entries: SituationImage[], text: string, shown: ReadonlySet<string>): string | null {
  const candidates = entries.filter(e => !shown.has(e.image) && e.keywords.length)
  const [hit] = selectLore(candidates.map(e => ({ keywords: e.keywords, content: e.image })), text)
  return hit?.content ?? null
}

const Choice = z.object({ pick: z.number().int().min(0).max(SITUATION_LIMITS.entries) })

/**
 * AI 가 고르기 — 만든 사람이 적은 상황 목록과 이번 턴(사용자 말 + 캐릭터 답)을 보고, 지금 장면이 그 상황이 된 사진 하나(없으면 0).
 * 싼 분류 모델(semantic_event 배치)로 짧게 한 번. 실패·시간 초과면 키워드로 고른다 — 사진 때문에 답을 망치지 않는다.
 */
export async function chooseSituationImage(llm: LLMProvider, entries: SituationImage[], turn: { userInput: string; responseText: string; scene?: string }, shown: ReadonlySet<string>): Promise<string | null> {
  const candidates = entries.filter(e => !shown.has(e.image))
  if (!candidates.length) return null
  const text = `${turn.userInput}\n${turn.responseText}`
  if (!candidates.some(e => e.situation)) return pickSituationImage(candidates, text, shown)
  const list = candidates.map((e, i) => `${i + 1}. ${e.situation || e.keywords.join(', ')}${e.situation && e.keywords.length ? ` (키워드: ${e.keywords.join(', ')})` : ''}`).join('\n')
  try {
    const { pick } = await Promise.race([
      llm.generateStructured({
        schema: Choice, task: 'semantic_event', promptVersion: 'situation-photo:v2', temperature: 0, maxTokens: 64, maxRetries: 1,
        responseSchema: { type: 'object', properties: { pick: { type: 'integer', minimum: 0 } }, required: ['pick'] },
        // 11/17 실측: 드라마 속 운전 얘기에 '운전' 사진을 띄워, 정작 차에 탄 턴엔 이미 쓴 사진이라 안 떴다 — 지금 두 사람이 있는 장소·하는 행동만 보게.
        system: '캐릭터 채팅에서 지금 장면에 띄울 사진을 고른다. 만든 사람이 적어 둔 상황 목록 중, 이번 대화에서 두 사람이 지금 있는 장소에서 지금 하고 있는(또는 방금 한) 행동이 그 상황인 것 하나의 번호를 고른다. '
          + '드라마·영화·꿈·소문·남의 이야기, 말로만 언급, 가정·과거·나중 이야기, 비유는 고르지 않는다. 지금 장면과 장소가 맞지 않으면 고르지 않는다. 확실하지 않거나 맞는 게 없으면 0. 반드시 {"pick": 번호} JSON 하나로만 답한다.',
        prompt: `## 상황 목록\n${list}\n\n${turn.scene ? `## 지금 장면\n${turn.scene}\n\n` : ''}## 이번 대화\n사용자: ${turn.userInput.slice(0, 600)}\n캐릭터: ${turn.responseText.slice(0, 1500)}`,
      }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('situation photo timeout')), 6000)),
    ])
    return pick >= 1 && pick <= candidates.length ? candidates[pick - 1]!.image : null
  } catch {
    return pickSituationImage(candidates, text, shown)
  }
}
