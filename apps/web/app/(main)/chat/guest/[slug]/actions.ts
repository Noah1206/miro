'use server'

import { randomUUID } from 'node:crypto'
import { requireUser } from '@/lib/auth'
import { getCharacterByKey } from '@/lib/characters'
import { homeUnveilEnabled } from '@/lib/home-mode'
import { createRoleplaySession } from '@/lib/simulation/start'
import { track } from '@/lib/analytics/track'
import { officialIntro } from '@/lib/editorial/official-copy'
import { introMessages, introScenes } from '@/lib/intro-dialogue'
import { explicitText } from '@/lib/explicit-text'
import { resolveRpLLM } from '@/lib/simulation/mock-llm'
import { SUGGEST_OUT, SUGGEST_SYSTEM, type Suggestion } from '@/lib/suggest-prompt'
import { msg } from '@/lib/i18n'

/** 게스트 대화창에서 로그인하고 돌아온 사람 — 방을 만들고(있으면 이어서) 방 번호를 돌려준다. 화면이 적어 둔 말을 그 방으로 넘긴다. */
export async function enterFromGuest(slug: string, scene?: string): Promise<{ sessionId: string } | { error: true }> {
  const user = await requireUser()
  const c = await getCharacterByKey(slug, user.id)
  if (!c || (c.adultOnly && c.ownerId !== user.id && !(await homeUnveilEnabled(user.id)))) return { error: true }
  try {
    const s = await createRoleplaySession(user.id, slug, { scene })
    if (s.created) {
      void track(user.id, 'character_selected', { characterId: s.characterId, official: s.isOfficial })
      void track(user.id, 'rp_started', { sessionId: s.sessionId, characterId: s.characterId, guest: true })
    }
    return { sessionId: s.sessionId }
  } catch { return { error: true } }
}

// ponytail: 인트로만 보고 만드는 후보라 작품·시작 상황마다 한 번 만들어 서버 메모리에 둔다(로그인 없는 AI 호출이 작품 수만큼으로 묶인다). 서버가 여러 대가 되면 DB·캐시로.
const cache = new Map<string, Promise<Suggestion[]>>()

/** 게스트 추천 답변 — 로그인 없이, 인트로에 대한 유저의 첫 반응 후보 3개. */
export async function guestSuggest(slug: string, scene?: string): Promise<{ options: Suggestion[] } | { error: string }> {
  const c = await getCharacterByKey(slug, null)
  if (!c || c.adultOnly) return { error: msg('대화를 찾을 수 없습니다.') }
  const dialogue = officialIntro(c, c.sampleDialogue)
  const picked = scene && introScenes(dialogue).includes(scene) ? scene : undefined
  const key = `${c.id}|${picked ?? ''}`
  let made = cache.get(key)
  if (!made) {
    const intro = introMessages('guest', dialogue, undefined, { scene: picked }).filter(m => m.kind === 'text' && !explicitText(m.content))
      .map(m => `${m.role === 'character' ? c.name : '서술'}: ${m.content.replace(/\s+/g, ' ').slice(-600)}`).join('\n')
    made = resolveRpLLM(c.name, { userId: null, requestId: randomUUID(), workload: 'interactive', origin: 'chat:guest-suggest', usageUnits: 0 })
      .generateStructured({ task: 'semantic_event', promptVersion: 'suggest-replies:v5', maxTokens: 450, schema: SUGGEST_OUT, system: SUGGEST_SYSTEM,
        prompt: `캐릭터: ${c.name}\n${c.startingContext ? `시작 상황(유저 시점): ${c.startingContext.slice(0, 500)}\n` : ''}\n최근 대화(맨 아래가 방금):\n${intro || '(아직 없음)'}` })
      .then(({ options }) => options.map(o => ({ say: o.say.replace(/^["“]|["”]$/g, '').trim(), act: o.act.trim() })).filter(o => o.say || o.act))
    cache.set(key, made)
    made.catch(() => cache.delete(key))
  }
  try { return { options: await made } } catch { return { error: msg('추천 답변을 만들지 못했어요. 다시 눌러 주세요.') } }
}
