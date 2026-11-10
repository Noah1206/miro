import { randomUUID } from 'node:crypto'
import { and, eq, isNull } from 'drizzle-orm'
import { z } from 'zod'
import { characters, db, officialVoices } from '@miro/db'
import { createAI } from '@miro/providers'
import { afterResponse } from '@/lib/defer'
import { observe } from '@/lib/observe'
import { installAIUsageSink } from '@/lib/usage/ai-usage'
import { matchSpeaker } from '@/lib/voice-text'
import { voiceGender } from '@/lib/voice'

/**
 * 등장인물 목소리 칸 채우기(11/10 사용자: "유저가 설정한 캐릭터들이 전부 미리 음성을 넣어서 안 끊기게").
 * 설정 글에서 대사를 할 만한 이름 있는 인물을 뽑아 ensemble_voices 에 없는 사람만 더한다 — 이미 있는 칸(작성자·운영자가 정한 것)은 그대로.
 * 성별이 작품 대상과 같은 쪽(남성향의 히로인, 여성향의 남자)은 '' = 자동(유저가 방에서 고른다), 반대쪽은 그 성별의 공식 목소리를 정해 둔다
 * — 자동 배정은 작품 대상의 반대 성별에서만 고르기 때문(lib/voice pickAutoVoice).
 */
const Cast = z.object({ people: z.array(z.object({ name: z.string().min(1).max(20), gender: z.enum(['male', 'female']), villain: z.boolean(), main: z.boolean().default(false), role: z.enum(['villain', 'friend', 'mentor', 'other']).default('other') })).max(40) })
const SYSTEM = [
  '캐릭터 설정 글을 읽고, 대화 장면에서 직접 대사를 할 수 있는 이름 있는 인물을 모두 뽑습니다.',
  '카드 이름(작품 제목일 수 있음), 사용자(나·당신), 이름 없는 무리(사람들·학생들)는 빼고, 이름은 설정에 적힌 그대로 씁니다(존칭·직함 없이).',
  '각 인물의 성별(male|female)과 악역·일진·건달·적대 세력처럼 거칠고 위협적인 쪽인지(villain)를 적습니다. 확실하지 않으면 villain=false.',
  '남자 인물은 role 도 적습니다: villain(악역·일진·건달·적대), friend(친구·동기·후배·소꿉친구·룸메이트), mentor(사부·선배·상사·보호자처럼 다정하거나 점잖은 어른), other(그 밖 — 주인공·라이벌·일반). 여자 인물은 other.',
  '카드가 가리키는 주인공(1:1 카드의 그 인물, 카드 이름이 사람 이름이면 그 사람)은 main=true 로 표시합니다 — 그 인물은 카드 목소리로 읽는다.',
  '반드시 JSON {"people":[{"name":"","gender":"male","villain":false,"main":false,"role":"other"}]} 만 반환합니다.',
].join('\n')

/** reassignMale(11/10 백필용): 이미 공식 남자 목소리(m-…)로 정해 둔 칸도 역할 규칙으로 다시 고른다. 작성자가 고른 회원 목소리·여자 칸은 그대로. */
export async function refreshVoiceCast(characterId: string, userId: string | null, opts: { reassignMale?: boolean } = {}): Promise<'updated' | 'unchanged' | 'skipped'> {
  const [row] = await db.select({ name: characters.name, personality: characters.personality, secret: characters.secret, startingContext: characters.startingContext, audience: characters.audience })
    .from(characters).where(and(eq(characters.id, characterId), isNull(characters.deletedAt))).limit(1)
  if (!row) return 'skipped'
  installAIUsageSink()
  // 사용자 월 사용량은 차감하지 않는다 — 관계 성격표처럼 저장에 딸린 서비스 준비 비용.
  const llm = createAI({ mock: () => ({ people: [] }), context: { userId: userId ?? undefined, requestId: randomUUID(), workload: 'background', usageUnits: 0, origin: 'character:voice-cast' } })
  const answer = await llm.generateStructured({ schema: Cast, task: 'dialogue', promptVersion: 'voice-cast:v1', system: SYSTEM, temperature: 0.2, maxTokens: 2048,
    prompt: JSON.stringify({ cardName: row.name, settings: [row.personality, row.startingContext, row.secret].filter(Boolean).join('\n\n').slice(0, 14000) }) })
  const pool = await db.select({ id: officialVoices.id, label: officialVoices.label }).from(officialVoices).where(and(eq(officialVoices.status, 'active'), isNull(officialVoices.ownerId)))
  const of = (g: 'male' | 'female') => pool.filter(v => voiceGender(v.label) === g).map(v => v.id).sort()
  // 11/10 사용자: 남자 목소리는 역할로 나눈다 — 악역 동원, 친구 준혁, 다정한 어른 진혁, 그 밖 주혁. 목소리가 내려가 있으면 이름으로 고른다.
  const ROLE_VOICE: Record<string, string> = { villain: 'm-dongwon', friend: 'm-junhyeok', mentor: 'm-jinhyeok', other: 'm-juhyeok' }
  const pick = (g: 'male' | 'female', name: string, villain: boolean, role = 'other') => {
    const list = of(g); if (!list.length) return ''
    const want = g === 'male' ? ROLE_VOICE[villain ? 'villain' : role] : undefined
    if (want && list.includes(want)) return want
    let h = 0; for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0
    return list[h % list.length]!
  }
  const same = row.audience === 'male' ? 'female' : 'male'
  return db.transaction(async (tx) => {
    const [current] = await tx.select({ ensembleVoices: characters.ensembleVoices, name: characters.name }).from(characters).where(eq(characters.id, characterId)).for('update').limit(1)
    if (!current) return 'skipped' as const
    const next = { ...(current.ensembleVoices ?? {}) }
    let added = 0
    for (const p of answer.people) {
      const name = p.name.trim()
      if (!name || p.main || name === current.name) continue
      const existing = matchSpeaker(name, Object.keys(next))
      if (existing) {
        if (!(opts.reassignMale && p.gender === 'male' && p.gender !== same && String(next[existing]).startsWith('m-'))) continue
        const v = pick('male', existing, p.villain, p.role)
        if (v && v !== next[existing]) { next[existing] = v; added++ }
        continue
      }
      next[name] = p.gender === same ? '' : pick(p.gender, name, p.villain, p.role)
      added++
    }
    if (!added) return 'unchanged' as const
    await tx.update(characters).set({ ensembleVoices: next }).where(eq(characters.id, characterId))
    return 'updated' as const
  })
}

/** 저장 뒤에 돌린다 — 저장은 모델을 기다리지 않는다. 실패하면 칸은 그대로이고, 다음 저장이 다시 시도한다. */
export async function scheduleVoiceCast(characterId: string, userId: string): Promise<void> {
  await afterResponse(async () => {
    try { await refreshVoiceCast(characterId, userId) } catch (e) {
      observe('voice_cast.failed', { characterId, error: (e as Error).message })
    }
  })
}
