import { writeFile } from 'node:fs/promises'
import { describe, it } from 'vitest'
import { and, desc, eq } from 'drizzle-orm'
import { db, aiUsage, usageWindows, userPersonas, userSettings, users } from '@miro/db'
import { createRoleplaySession } from './start'
import { runConversationTurn } from './turn'

/**
 * 11/26 출력량 단계별 실제 길이 — 같은 캐릭터·같은 첫 입력을 새 방에서 짧게·기본·조금 길게·길게·아주 길게로 한 번씩.
 * 운영 실측에서 짧게=기본, 길게≈조금 길게로 차이가 약했다. 답 글자 수와 출력 토큰을 남긴다.
 */
const OUT = process.env.MIRO_COMPARE_OUT
if (OUT) Object.assign(process.env, { MIRO_CHARACTER_AGENCY_MODE: 'live', MIRO_AGENCY_DEFAULT_POLICY: '', MIRO_FEATURE_STRICT_CONVERSATION_REVIEW: '0' })
const CHARACTER = 'fdf8aa88-14d2-442f-8eca-03576e3af919'
const INPUT = '(퇴근길, 회사 앞에서 대표님 차를 기다리며) 오늘 진짜 길었어요. 팀장님이 기획서를 또 반려했거든요. 대표님은 오늘 뭐 하셨어요?'
const LENGTHS = ['short', 'scene', 'plus', 'long', 'saga'] as const

describe.skipIf(!OUT)('reply length', () => {
  it('measures each length once', async () => {
    const model = process.env.MIRO_LENGTH_MODEL || 'claude-sonnet'
    const rows: Record<string, unknown>[] = []
    for (const length of LENGTHS) {
      const [owner] = await db.insert(users).values({ email: `len-${length}-${Date.now()}@example.test` }).returning()
      await db.insert(userSettings).values({ userId: owner!.id, timeZone: 'Asia/Seoul' })
      const now = new Date()
      await db.insert(usageWindows).values({ userId: owner!.id, plan: 'pro', startedAt: now, endsAt: new Date(now.getTime() + 30 * 86_400_000), limit: 100_000_000 })
      await db.insert(userPersonas).values({ userId: owner!.id, name: '지민', gender: 'female', description: '서울에 사는 20대 후반 회사원.' })
      const { sessionId } = await createRoleplaySession(owner!.id, CHARACTER)
      const r = await runConversationTurn({ userId: owner!.id, sessionId, input: INPUT, chatModel: `model:${encodeURIComponent(model)}:${length}` })
      const text = r.ok ? r.blocks.map(b => b.text).join('\n') : ''
      const [u] = await db.select({ out: aiUsage.outputTokens }).from(aiUsage).where(and(eq(aiUsage.userId, owner!.id), eq(aiUsage.task, 'dialogue'))).orderBy(desc(aiUsage.id)).limit(1)
      rows.push({ length, ok: r.ok, reason: r.ok ? null : r.reason, chars: text.length, blocks: r.ok ? r.blocks.length : 0, outputTokens: u?.out ?? null })
      console.log(length, r.ok, text.length, u?.out)
    }
    await writeFile(OUT!, JSON.stringify(rows, null, 2))
  }, 30 * 60_000)
})
