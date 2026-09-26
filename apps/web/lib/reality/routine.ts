import { after } from 'next/server'
import { and, eq, isNull } from 'drizzle-orm'
import { z } from 'zod'
import { db, characters, contactProfiles, worlds } from '@miro/db'
import { POLICY } from '@miro/config'
import { availabilityAt, defaultRoutine, localClock, normalizeActiveHours, parseRoutine, type AvailabilityNow, type Routine } from '@miro/domain'
import { createAI } from '@miro/providers'
import { observe } from '@/lib/observe'
import { installAIUsageSink } from '@/lib/usage/ai-usage'

/**
 * 캐릭터의 생활 리듬을 한 번 만들어 contact_profiles.routine 에 둔다.
 * 캐릭터 설정(직업·위치·세계관·성격)에서 모델이 짓는다 — 일상적 인간이 아닐 수 있으므로 정해진 틀(수업·근무·수면)을 강요하지 않는다.
 * 모델이 없거나 답이 이상하면 활동 시간 밖을 자는 것으로 보는 기본 리듬을 쓴다(예전 규칙과 같음).
 */
const RoutineAnswer = z.object({
  blocks: z.array(z.object({
    days: z.array(z.number().int().min(0).max(6)),
    start: z.string(), end: z.string(), label: z.string(), availability: z.enum(['free', 'busy', 'unreachable']),
  })).min(1).max(14),
  note: z.string().nullable().optional(),
})

const SYSTEM = [
  '당신은 캐릭터 설정을 읽고 그 캐릭터의 일주일 생활 리듬을 정하는 작가입니다. 결과는 앱이 "지금 이 캐릭터에게 연락이 닿는가" 를 판단하는 데 씁니다.',
  '- 캐릭터가 사는 세계와 신분에 맞게 정합니다. 현대 직장인이면 출퇴근·수면, 기사라면 훈련·순찰·의무, 밤에 사는 존재라면 낮이 수면입니다. 정해진 틀을 강요하지 않습니다.',
  '- 시각은 사용자의 하루(현지 시간, 24시간 HH:MM)를 기준으로 합니다 — 세계의 하루도 이 시계를 따릅니다.',
  '- availability: free = 연락이 자유로움, busy = 짧은 문자는 되지만 통화는 못 받음(근무·수업·임무), unreachable = 아예 닿지 않음(수면·이동·통신 불가).',
  '- 블록은 3~10개. days 는 0(일)~6(토) 배열이며 빈 배열은 매일. end 가 start 보다 이르면 자정을 넘깁니다. label 은 캐릭터가 자기 입으로 부를 이름으로 짧게.',
  '- 하루 중 free 인 시간이 반드시 있어야 합니다. 24시간 내내 busy/unreachable 로 만들지 않습니다.',
  '- note 에는 이 리듬이 왜 그런지 한 줄(예: "성 밖 순찰이 밤에 있어 오후에 잔다").',
  '반드시 JSON { "blocks": [...], "note": string|null } 만 반환합니다.',
].join('\n')

const ROUTINE_RETRY_MS = 24 * 3_600_000

/** 같은 캐릭터의 리듬을 동시에 여러 번 만들지 않는다 — 첫 화면 여러 개가 한꺼번에 열려도 모델은 한 번만 부른다. */
const generating = new Map<string, Promise<Routine>>()

/**
 * 리듬. 저장된 것이 있으면 그것. 없으면 wait=true(크론 등 백그라운드)는 만들어서 돌려주고,
 * wait=false(화면·턴)는 기본 리듬으로 바로 답하고 만드는 일은 뒤로 돌린다 — 첫 화면이 모델을 기다리지 않게.
 */
export async function routineFor(characterId: string, opts: { wait?: boolean } = {}): Promise<Routine> {
  const [row] = await db.select({ routine: contactProfiles.routine, start: contactProfiles.activeHoursStart, end: contactProfiles.activeHoursEnd })
    .from(contactProfiles).where(eq(contactProfiles.characterId, characterId)).limit(1)
  const raw = row?.routine as { source?: Routine['source']; generatedAt?: string } | null | undefined
  const stored = raw ? parseRoutine(raw, raw.source ?? 'generated', String(raw.generatedAt ?? '')) : null
  // 기본 리듬은 생성이 실패했을 때의 자리표시다 — 하루가 지나면 다시 만들어 본다(그 사이엔 기본 리듬으로 답한다).
  const retry = stored?.source === 'default' && Date.now() - Date.parse(stored.generatedAt) > ROUTINE_RETRY_MS
  if (stored && !retry) return stored
  let job = generating.get(characterId)
  if (!job) {
    job = generateRoutine(characterId).finally(() => generating.delete(characterId))
    generating.set(characterId, job)
  }
  if (opts.wait) return job
  // 서버리스는 응답 뒤 할 일을 after 로 알려야 함수가 살아 있다. 요청 밖(테스트)에서는 그냥 흘려보낸다.
  try { after(() => job.catch(() => undefined)) } catch { job.catch(() => undefined) }
  return stored ?? defaultRoutine({ start: row?.start ?? '08:00', end: row?.end ?? '23:00' }, new Date().toISOString())
}

async function generateRoutine(characterId: string): Promise<Routine> {
  const [row] = await db.select({ profile: contactProfiles, character: characters, world: worlds })
    .from(contactProfiles).innerJoin(characters, eq(characters.id, contactProfiles.characterId))
    .leftJoin(worlds, eq(worlds.characterId, characters.id))
    .where(and(eq(contactProfiles.characterId, characterId), isNull(characters.deletedAt))).limit(1)
  if (!row) return defaultRoutine({ start: '08:00', end: '23:00' }, new Date().toISOString())
  const activeHours = { start: row.profile.activeHoursStart, end: row.profile.activeHoursEnd }
  const stored = row.profile.routine ? parseRoutine(row.profile.routine, (row.profile.routine as { source?: Routine['source'] }).source ?? 'generated', String((row.profile.routine as { generatedAt?: string }).generatedAt ?? '')) : null
  if (stored && stored.source !== 'default') return stored

  const generatedAt = new Date().toISOString()
  let routine: Routine | null = null
  try {
    const c = row.character
    // 운영 오케스트레이터는 예산 가드 없이는 부르지 않는다(production_guard_required) — 다른 Reality 경로처럼 먼저 설치한다. 9/26 운영에서 이것 때문에 전부 기본 리듬이 됐다.
    installAIUsageSink()
    const llm = createAI({ mock: () => ({ blocks: [], note: null }), context: { userId: c.ownerId ?? undefined, workload: 'background' } })
    const answer = await llm.generateStructured({
      // 운영 모델 레지스트리에는 world_update 담당 모델이 없다(9/26 확인) — 캐릭터를 쓰는 dialogue 모델이 짓는다. 캐릭터당 한 번.
      schema: RoutineAnswer, task: 'dialogue', promptVersion: 'routine:v1', system: SYSTEM, maxTokens: 900,
      prompt: [
        `이름: ${c.name}`, c.occupation ? `직업: ${c.occupation}` : null, c.role ? `역할: ${c.role}` : null,
        c.socialPosition ? `세계 안에서의 위치: ${c.socialPosition}` : null, c.age ? `나이: ${c.age}` : null,
        `성격: ${c.personality}`,
        row.world?.era ? `시대: ${row.world.era}` : null, row.world?.location ? `주 활동 장소: ${row.world.location}` : null,
        row.world?.worldSetting ? `세계관: ${row.world.worldSetting}` : null, row.world?.genre ? `장르: ${row.world.genre}` : null,
        c.startingContext ? `첫 장면: ${c.startingContext}` : null,
        normalizeActiveHours(activeHours) ? `참고: 작성자가 정한 연락 가능 시간 ${normalizeActiveHours(activeHours)!.start}~${normalizeActiveHours(activeHours)!.end} (이 밖은 보통 쉰다).` : '참고: 작성자는 하루 종일 연락이 된다고 적었다.',
      ].filter(Boolean).join('\n'),
    })
    routine = parseRoutine(answer, 'generated', generatedAt)
    if (!routine) observe('routine.invalid', { characterId })
  } catch (e) {
    observe('routine.generation_failed', { characterId, error: (e as Error).message })
  }
  routine ??= defaultRoutine(activeHours, generatedAt)
  // 기본 리듬도 저장한다 — 매 판정마다 모델을 다시 부르지 않는다. 캐릭터 편집 화면이 생기면 거기서 지워 다시 만들게 한다.
  await db.update(contactProfiles).set({ routine }).where(eq(contactProfiles.characterId, characterId))
  return routine
}

/** 지금 이 캐릭터에게 연락이 닿는가 — 선연락·통화·문자 답장이 같은 답을 본다. */
export async function characterAvailability(characterId: string, now: Date, timeZone: string = POLICY.reality.defaultTimeZone, opts: { wait?: boolean } = {}): Promise<AvailabilityNow & { routine: Routine }> {
  const routine = await routineFor(characterId, opts)
  return { ...availabilityAt(routine, localClock(now, timeZone)), routine }
}
