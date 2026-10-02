import { writeFile } from 'node:fs/promises'
import { describe, it, vi } from 'vitest'
import { and, asc, eq, gt, sql } from 'drizzle-orm'
import { db, aiUsage, characters, contactProfiles, messages, realityContacts, relationships, roleplaySessions, userPersonas, userSettings, users } from '@miro/db'
import { defaultRoutine, firstContactDelayMinutes } from '@miro/domain'
import * as engine from '@miro/engine'
import { cloneCharacterAsReality } from '@/lib/dev/reality-clone'
import { createRoleplaySession } from '@/lib/simulation/start'
import { runConversationTurn } from '@/lib/simulation/turn'
import { evaluateSession } from './evaluate'

/**
 * Reality 인터랙션 실측(2026-10-02). 실제 앱 경로로 한 사용자가 캐릭터와 처음 만나 4턴 대화하고 떠난 뒤
 * 첫 연락 → 문자 답장 → 답 생성 실패 뒤 늦은 답장 → 바쁠 때 온 문자의 늦은 답장까지 간다.
 * 시간은 이 세션의 과거 시각을 앞당겨 흐르게 한다(판단은 실제 지금) — 미래 시각이 기록에 섞이지 않는다.
 * 실행은 ai/evals/live-app.ts --eval reality.
 */
const OUT = process.env.MIRO_REALITY_EVAL_OUT
const TARGETS = (process.env.MIRO_REALITY_EVAL_CHARACTERS ?? '').split(',').filter(Boolean)

const SCRIPTS: Record<string, { scene: string[]; reply: string; failed: string; busy: { label: string; text: string } }> = {
  권재혁: {
    scene: ['아, 오늘부터 경호 맡아 주시는 대표님이시죠? 생각보다 젊으시네요.', '사실 요즘 퇴근길에 누가 따라오는 것 같아서요. 회사 앞에서도 두 번이나 봤어요.',
      '그리고 저 다음 주에 이직 면접이 있어서, 그날은 아침 일찍 나가야 해요.', '오늘은 이만 들어가 볼게요. 내일 뵐게요.'],
    reply: '연락 주셔서 감사해요. 오늘은 별일 없었어요.',
    failed: '참, 면접 날짜 나왔어요. 다음 주 수요일 오후 2시예요.',
    busy: { label: '외부 미팅 및 현장 점검', text: '지금 어디세요?' },
  },
  강태윤: {
    scene: ['안녕하세요, 이번 주부터 프런트에 새로 온 지민이에요.', '첫 주라 정신이 하나도 없어요. 실수할까 봐 계속 긴장돼요.',
      '아 그리고 다음 주 금요일에 VIP 단체 체크인 있다고 들었는데, 제가 맡게 될까요?', '오늘 많이 배웠어요. 먼저 퇴근해 보겠습니다!'],
    reply: '메시지 감사해요! 오늘은 무사히 끝났어요.',
    failed: '참, VIP 체크인 명단 받았어요. 스무 명이래요.',
    busy: { label: '회의', text: '지금 어디 계세요?' },
  },
  토마스: {
    scene: ['안녕하세요. 할머니께 물려받은 책인데, 복원이 가능할까요?', '표지가 많이 상했어요. 할머니가 아끼시던 거라 꼭 살리고 싶어요.',
      '아, 저는 다음 주에 서울로 돌아가요. 그 전에 끝날 수 있을까요?', '오늘 시간 내 주셔서 감사합니다. 그럼 연락 기다릴게요.'],
    reply: '편지 잘 받았어요. 책 때문에 신경 써 주셔서 고마워요.',
    failed: '참, 서울 가는 비행기가 목요일 오전으로 정해졌어요.',
    busy: { label: '복원 작업', text: '지금 공방에 계세요?' },
  },
}

class Stop extends Error {}
const hhmm = (d: Date) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d)

/** 시간이 흐른 것처럼 — 이 세션의 과거 시각을 모두 minutes 만큼 앞당긴다. */
async function elapse(sessionId: string, minutes: number) {
  const by = sql`make_interval(mins => ${minutes})`
  await db.execute(sql`UPDATE roleplay_sessions SET last_interaction_at = last_interaction_at - ${by}, reality_checked_at = reality_checked_at - ${by} WHERE id = ${sessionId}`)
  await db.execute(sql`UPDATE reality_contacts SET sent_at = sent_at - ${by}, opened_at = opened_at - ${by}, created_at = created_at - ${by} WHERE session_id = ${sessionId}`)
  await db.execute(sql`UPDATE messages SET created_at = created_at - ${by} WHERE session_id = ${sessionId}`)
  await db.execute(sql`UPDATE memories SET created_at = created_at - ${by} WHERE session_id = ${sessionId}`)
  const [s] = await db.select({ p: roleplaySessions.pendingRealityIntent, state: roleplaySessions.characterState }).from(roleplaySessions).where(eq(roleplaySessions.id, sessionId))
  const back = (iso: string) => new Date(new Date(iso).getTime() - minutes * 60_000).toISOString()
  // '잘 들어갔어?' 표시는 마지막 상호작용 시각을 이름으로 쓴다 — 같이 앞당기지 않으면 같은 장면이 새 장면처럼 보인다.
  const fired = (s!.state as { firedRules?: string[] }).firedRules
  if (!fired && !s!.p) return
  await db.update(roleplaySessions).set({
    ...(fired ? { characterState: { ...s!.state, firedRules: fired.map(f => f.startsWith('after_scene:') ? `after_scene:${back(f.slice('after_scene:'.length))}` : f) } } : {}),
    ...(s!.p ? { pendingRealityIntent: { ...s!.p, ...(s!.p.notBefore ? { notBefore: back(s!.p.notBefore) } : {}), ...(s!.p.deferredSince ? { deferredSince: back(s!.p.deferredSince) } : {}) } } : {}),
  }).where(eq(roleplaySessions.id, sessionId))
}

describe.skipIf(!OUT)('reality live eval', () => {
  it('runs first contact and text replies through the real app path', async () => {
    const [owner] = await db.insert(users).values({ email: `reality-eval-${Date.now()}@example.test` }).returning()
    await db.insert(userSettings).values({ userId: owner!.id, timeZone: 'Asia/Seoul' })
    await db.insert(userPersonas).values({ userId: owner!.id, name: '지민', gender: 'female', description: '서울에 사는 20대 후반 회사원. 이직을 준비하고 있다.' })
    const mark = async () => Number((await db.select({ id: sql<string>`coalesce(max(${aiUsage.id}), 0)` }).from(aiUsage).where(eq(aiUsage.userId, owner!.id)))[0]!.id)
    const since = async (from: number) => (await db.select().from(aiUsage).where(and(eq(aiUsage.userId, owner!.id), gt(aiUsage.id, from))).orderBy(asc(aiUsage.id)))
      .map(r => ({ task: r.task, prompt: r.promptVersion, model: r.model, ok: r.ok, error: r.error, latencyMs: r.latencyMs, costUSD: Number(r.actualCost ?? r.estimatedCost ?? 0) }))
    const report: Record<string, unknown>[] = []
    let stopped: string | null = null

    for (const target of TARGETS) {
      const units: Record<string, unknown>[] = []
      let characterId: string
      if (/^[0-9a-f-]{36}$/.test(target)) characterId = target
      else {
        characterId = (await cloneCharacterAsReality(target, { ownerId: owner!.id })).id
        // 시드에는 생활 리듬이 없다 — 비워 두면 첫 판정이 리듬을 AI 로 만든다. 기본 리듬(활동 시간 밖은 잠)을 둔다.
        const [p] = await db.select().from(contactProfiles).where(eq(contactProfiles.characterId, characterId))
        await db.update(contactProfiles).set({ routine: defaultRoutine({ start: p!.activeHoursStart, end: p!.activeHoursEnd }, new Date().toISOString()) }).where(eq(contactProfiles.characterId, characterId))
      }
      const [character] = await db.select().from(characters).where(eq(characters.id, characterId))
      const [profile] = await db.select().from(contactProfiles).where(eq(contactProfiles.characterId, characterId))
      const script = SCRIPTS[character!.name]
      if (!script) throw new Error(`no script for ${character!.name}`)
      const { sessionId } = await createRoleplaySession(owner!.id, characterId)
      const delay = firstContactDelayMinutes(character!.initiative, profile!.initiativeLevel)

      const turn = async (input: string, mode?: 'messenger') => {
        const from = await mark(), t0 = performance.now()
        const r = await runConversationTurn({ userId: owner!.id, sessionId, input, mode })
        units.push({ kind: mode ? 'text' : 'scene', input, ok: r.ok, ...(r.ok ? { delayed: r.delayed ?? null, blocks: r.blocks.map(b => ({ type: b.type, speaker: b.speaker ?? null, text: b.text })) } : { reason: r.reason }),
          wallMs: Math.round(performance.now() - t0), calls: await since(from) })
        if (!r.ok && (r.reason === 'budget' || r.reason === 'usage')) throw new Stop(r.reason)
        return r
      }
      const contact = async (label: string) => {
        const from = await mark(), t0 = performance.now()
        // 운영 스케줄러처럼 실패는 기록하고 다음으로 간다(모델 장애로 한 번 실패해도 나머지를 본다).
        const r = await evaluateSession(sessionId, new Date(), { background: true }).catch((e: Error) => ({ outcome: 'error' as const, reason: e.message }))
        const [c] = r.outcome === 'sent' ? await db.select().from(realityContacts).where(eq(realityContacts.id, r.contactId)) : []
        const payload = (c?.payload ?? {}) as { text?: string; tone?: string; channelLabel?: string; senderLabel?: string }
        units.push({ kind: 'contact', label, outcome: r.outcome, ...('reason' in r ? { reason: r.reason } : {}), intent: c?.reason ?? null, dedupeKey: c?.dedupeKey ?? null,
          text: payload.text ?? null, tone: payload.tone ?? null, channelLabel: payload.channelLabel ?? null, senderLabel: payload.senderLabel ?? null,
          wallMs: Math.round(performance.now() - t0), calls: await since(from) })
        return r
      }

      try {
        for (const line of script.scene) await turn(line)
        // 헤어지고 한 시간 — '잘 들어갔어?'(관계가 되면) 또는 아무것도. 그다음 성격대로의 첫 연락 시각까지.
        await elapse(sessionId, 60)
        const early = await contact('after 60 min')
        if (early.outcome !== 'sent') { await elapse(sessionId, Math.max(0, delay + 5 - 60)); await contact(`after ${delay + 5} min (first contact)`) }
        await elapse(sessionId, 20)
        await turn(script.reply, 'messenger')
        // 답 생성이 한 번 실패한다 — 내 문자는 남고 몇 분 뒤 답장이 와야 한다.
        await elapse(sessionId, 3)
        vi.spyOn(engine, 'runTurn').mockRejectedValueOnce(new Error('ai unavailable after 3 attempts: provider_overloaded'))
        await turn(script.failed, 'messenger')
        await elapse(sessionId, 8)
        await contact('reply after a failed generation')
        // 캐릭터가 바쁜 중에 온 문자 — 바쁜 일이 끝난 뒤 답장.
        await elapse(sessionId, 10)
        const now = new Date()
        const original = profile!.routine
        await db.update(contactProfiles).set({ routine: { version: 1, source: 'authored', note: null, generatedAt: now.toISOString(),
          blocks: [{ days: [], start: hhmm(new Date(now.getTime() - 20 * 60_000)), end: hhmm(new Date(now.getTime() + 40 * 60_000)), label: script.busy.label, availability: 'busy' }] } })
          .where(eq(contactProfiles.characterId, characterId))
        const busy = await turn(script.busy.text, 'messenger')
        await db.update(contactProfiles).set({ routine: original }).where(eq(contactProfiles.characterId, characterId))
        const until = busy.ok && busy.delayed ? new Date(busy.delayed.until) : null
        if (until) { await elapse(sessionId, Math.ceil((until.getTime() - Date.now()) / 60_000) + 1); await contact('reply after being busy') }
      } catch (e) {
        if (!(e instanceof Stop)) throw e
        stopped = e.message
      }

      const transcript = (await db.select().from(messages).where(eq(messages.sessionId, sessionId)).orderBy(asc(messages.createdAt), asc(messages.id)))
        .map(m => ({ role: m.role, kind: m.kind, content: m.content, blocks: (m.blocks as Array<{ type: string; speaker?: string | null; text?: string }> | null)?.map(b => ({ type: b.type, speaker: b.speaker ?? null, text: b.text ?? null })) ?? [] }))
      const [rel] = await db.select().from(relationships).where(eq(relationships.sessionId, sessionId))
      report.push({ character: character!.name, initiative: character!.initiative, initiativeLevel: profile!.initiativeLevel, firstContactDelayMinutes: delay,
        relationship: rel ? { stage: rel.stage, trust: rel.trust, attachment: rel.attachment, emotionalDistance: rel.emotionalDistance, attraction: rel.attraction } : null,
        units, transcript })
      if (stopped) break
    }
    const all = await since(0)
    await writeFile(OUT!, JSON.stringify({ stopped, totalUSD: all.reduce((a, c) => a + c.costUSD, 0), calls: all.length,
      failedCalls: all.filter(c => !c.ok).map(c => `${c.task}:${c.error}`), modes: [...new Set(all.map(c => c.model))], characters: report }, null, 2))
  })
})
