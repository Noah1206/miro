import { writeFile } from 'node:fs/promises'
import { describe, it } from 'vitest'
import { and, eq, gt, sql } from 'drizzle-orm'
import { db, aiUsage, characters, roleplaySessions, sessionNovels, usageWindows, userPersonas, userSettings, users } from '@miro/db'
import { createRoleplaySession } from './start'
import { runConversationTurn } from './turn'
import { writeNextChapter } from '@/lib/novel'

/**
 * 엔딩 → 웹소설 실측(11/9). 아르덴 방을 실제 앱 경로로 결말까지 몰아가서 ① AI 가 '— ENDING · 이름 —' 을 쓰는지 ② 결말이 기록되는지
 * ③ 웹소설이 끝까지 써지는지(무료 한 벌) 본다. 판정은 사람이 파일을 읽는다. 아르덴 행은 미리 측정 DB 에 시드해 둔다.
 */
const OUT = process.env.MIRO_COMPARE_OUT
if (OUT) Object.assign(process.env, { MIRO_CHARACTER_AGENCY_MODE: 'live', MIRO_AGENCY_DEFAULT_POLICY: '', MIRO_FEATURE_STRICT_CONVERSATION_REVIEW: '0' })

const LINES = [
  '이름은 레온, 스물셋. 검은 머리에 흉터 하나. 클래스는 검사. 시작할 곳은 ② 로웰.',
  '주변을 둘러보며 검을 뽑는다. 일단 살아남아야지.',
  '(몇 주 뒤) 리제, 시엘, 노아와 파티를 꾸려 검은 우물 깊은 층까지 내려갔다. 엘리시아, 우리 꽤 강해졌지?',
  '(시간이 흘러 붉은 달의 밤) 잿빛 황무지 균열 앞. 신전은 내가 마왕의 별이라 선포했고 성기사단이 쫓아온다. 엘리시아, 처음부터 날 감시하러 온 거였어?',
  '괜찮아. 지금 네가 내 옆에 있잖아. 여덟 번째 별의 힘으로 균열을 닫겠어. 모두 뒤로 물러나.',
  '검에 별빛을 모아 균열 한가운데로 뛰어든다. 끝까지 간다!',
  '균열이 닫히고, 동이 튼다. 엘리시아의 손을 잡는다. 이제 다 끝났어.',
  '그래서, 우리 이야기는 이렇게 끝나는 거야?',
]

describe.skipIf(!OUT)('novel ending', () => {
  it('drives Arden to an ending and writes the web novel', async () => {
    const [arden] = await db.select({ id: characters.id }).from(characters).where(eq(characters.slug, 'official-m-arden'))
    if (!arden) throw new Error('seed official-m-arden into the eval DB first')
    // MIRO_NOVEL_SESSION 이면 이미 결말 난 방으로 웹소설만 다시 쓴다(대화 턴 비용 없이).
    const again = process.env.MIRO_NOVEL_SESSION
    const [prevRoom] = again ? await db.select({ userId: roleplaySessions.userId }).from(roleplaySessions).where(eq(roleplaySessions.id, again)) : []
    const [owner] = prevRoom ? [{ id: prevRoom.userId }] : await db.insert(users).values({ email: `novel-${Date.now()}@example.test` }).returning()
    if (!prevRoom) {
    await db.insert(userSettings).values({ userId: owner!.id, timeZone: 'Asia/Seoul' })
    const now = new Date()
    await db.insert(usageWindows).values({ userId: owner!.id, plan: 'pro', startedAt: now, endsAt: new Date(now.getTime() + 30 * 86_400_000), limit: 100_000_000 })
    await db.insert(userPersonas).values({ userId: owner!.id, name: '레온', gender: 'male', description: '스물셋 검사, 검은 머리에 뺨의 흉터. 시작할 곳은 로웰.' })
    }
    const sessionId = again ?? (await createRoleplaySession(owner!.id, arden.id)).sessionId
    const turns: Record<string, unknown>[] = []
    let ending: string | null = null
    const result: Record<string, unknown> = { sessionId, turns }
    try {
      for (const [i, input] of (again ? [] : LINES).entries()) {
        const r = await runConversationTurn({ userId: owner!.id, sessionId, input })
        const blocks = r.ok ? r.blocks.map(b => ({ type: b.type, speaker: b.speaker ?? null, text: b.text })) : []
        const [n] = await db.select({ ending: sessionNovels.endingTitle }).from(sessionNovels).where(eq(sessionNovels.sessionId, sessionId))
        turns.push({ n: i + 1, input, ok: r.ok, reason: r.ok ? null : r.reason, endingRecorded: n?.ending ?? null, blocks })
        if (!r.ok && (r.reason === 'budget' || r.reason === 'usage')) break
        if (n?.ending) { ending = n.ending; break }
      }
      result.ending = ending
      // 결말이 안 났어도 웹소설은 써 본다(그땐 유료 경로 — 측정 계정 한도가 넉넉하다).
      const chapters: unknown[] = []
      for (let k = 0; k < 5; k++) {
        const { chapter, done } = await writeNextChapter(sessionId, owner!.id)
        if (chapter) chapters.push(chapter)
        if (done) break
      }
      const [novel] = await db.select().from(sessionNovels).where(eq(sessionNovels.sessionId, sessionId))
      Object.assign(result, { chapters, freeUsed: novel?.freeUsed ?? null, status: novel?.status ?? null })
    } catch (e) {
      result.error = (e as Error).message
    } finally {
      const [cost] = await db.select({ usd: sql<string>`coalesce(sum(coalesce(${aiUsage.actualCost}, ${aiUsage.estimatedCost})), 0)` }).from(aiUsage).where(and(eq(aiUsage.userId, owner!.id), gt(aiUsage.id, 0)))
      result.usd = Number(cost!.usd)
      await writeFile(OUT!, JSON.stringify(result, null, 2))
    }
  }, 60 * 60_000)
})
