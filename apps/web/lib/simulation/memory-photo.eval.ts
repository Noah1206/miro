import { writeFile } from 'node:fs/promises'
import { describe, it } from 'vitest'
import { and, asc, eq, gt, sql } from 'drizzle-orm'
import { db, aiUsage, characters, memories, messages, roleplaySessions, usageWindows, userPersonas, userSettings, users } from '@miro/db'
import { createRoleplaySession } from './start'
import { runConversationTurn } from './turn'

/**
 * 상황별 사진·기억 실측(11/17). 실제 앱 경로 20턴: 상황 사진이 그 상황이 '벌어질 때만' 뜨는지, 유저노트·고정 기억·창(15턴) 밖 기억·정정이 지켜지는지.
 * 판정은 사람이 읽는다 — 답·사진·기억 목록을 파일로 남긴다.
 */
const OUT = process.env.MIRO_COMPARE_OUT
if (OUT) Object.assign(process.env, { MIRO_CHARACTER_AGENCY_MODE: 'live', MIRO_AGENCY_DEFAULT_POLICY: '', MIRO_FEATURE_STRICT_CONVERSATION_REVIEW: '0' })
const CHARACTER = 'fdf8aa88-14d2-442f-8eca-03576e3af919'   // 권재혁
const PHOTOS = [
  { image: 'https://example.test/umbrella.png', situation: '비 오는 날 우산 하나를 같이 쓰고 걷는 장면', keywords: ['우산'] },
  { image: 'https://example.test/driving.png', situation: '권재혁이 차를 운전하고 지민이 조수석에 탄 장면', keywords: ['운전'] },
  { image: 'https://example.test/scar.png', situation: '장갑을 벗어 손등의 흉터가 드러난 장면', keywords: ['흉터'] },
  { image: 'https://example.test/ramen.png', situation: '둘이 마주 앉아 라면을 같이 먹는 장면', keywords: ['라면'] },
  { image: 'https://example.test/police.png', situation: '경찰서 앞에서 권재혁이 지민을 기다리는 장면', keywords: ['경찰서'] },
]
const NOTE = '지민은 "자기"라고 불리는 걸 싫어한다. 권재혁은 지민을 항상 "지민 씨"라고 부른다.'
type Line = { input: string; probe?: string }
const LINES: Line[] = [
  { input: '대표님, 오늘부터 잘 부탁드려요.', probe: '[유저노트] "지민 씨" 호칭' },
  { input: '아 그리고 저 고양이 키워요. 이름은 두부고 하얀 고양이예요. 저 복숭아 알레르기도 있어서 뭐 사 오시면 복숭아만은 빼 주세요.' },
  { input: '다음 달 22일이 제 동생 결혼식이에요. 그날은 대구까지 가야 해요.' },
  { input: '그리고 저 매운 거 진짜 못 먹어요. 떡볶이도 순한 맛만 먹어요.' },
  { input: '요즘 드라마 보는데 경호원이 차 운전하는 장면이 멋있더라고요.', probe: '[사진 없음] 운전은 드라마 얘기일 뿐' },
  { input: '어, 비 온다. 우산 하나밖에 없는데 같이 써요. 붙어서 걸어요.', probe: '[사진: 우산]' },
  { input: '나중에 언젠가 같이 라면 끓여 먹어요. 제가 잘 끓여요.', probe: '[사진 없음] 라면은 나중 얘기' },
  { input: '오늘 회사에서 팀장님한테 또 깨졌어요.' },
  { input: '(집에 도착해서) 라면 다 끓었어요! 앉으세요, 같이 먹어요. 후후 불면서 드세요.', probe: '[사진: 라면]' },
  { input: '대표님 커피는 뭐 드세요? 내일 사 올게요.', probe: '[사진 없음]' },
  { input: '요즘 매운 거 연습하고 있어요. 이제는 불닭도 잘 먹어요. 진짜로요.' },
  { input: '주말에 친구가 놀러 오고 싶대요. 괜찮을까요?' },
  { input: '현관 비밀번호 바꿨어요. 이번엔 생일 말고 다른 걸로.' },
  { input: '저 호신술이라도 배워야 할까요?' },
  { input: '오늘 하늘 진짜 예쁘다. 노을 봐요.' },
  { input: '배고파요. 오늘 저녁 뭐 먹지.' },
  { input: '내일은 야근이라 열 시쯤 끝날 것 같아요.' },
  { input: '근데 대표님, 우리 집 고양이 이름 기억하세요?', probe: '[기억·창 밖] 두부(하얀 고양이)' },
  { input: '제 동생 결혼식 언제, 어디라고 했는지 기억나요?', probe: '[기억·창 밖] 다음 달 22일, 대구' },
  { input: '회사 동료가 복숭아 타르트를 줬어요. 저녁으로 불닭이랑 이거 먹어도 되겠죠?', probe: '[고정 기억] 복숭아 경고 / [정정] 불닭은 이제 괜찮음(매운 거 못 먹는다고 하지 않음)' },
]

describe.skipIf(!OUT)('memory and situation photos', () => {
  it('runs a 20-turn room', async () => {
    const [prev] = await db.select({ photos: characters.situationImages }).from(characters).where(eq(characters.id, CHARACTER))
    const turns: Record<string, unknown>[] = []
    let sessionId = '', ownerId = ''
    try {
      await db.update(characters).set({ situationImages: PHOTOS }).where(eq(characters.id, CHARACTER))
      // 이어 돌리기: MIRO_MEMPHOTO_SESSION=<방 id> MIRO_MEMPHOTO_FROM=<턴 번호>
      const resume = process.env.MIRO_MEMPHOTO_SESSION, from = Number(process.env.MIRO_MEMPHOTO_FROM ?? 1)
      if (resume) {
        const [room] = await db.select({ userId: roleplaySessions.userId }).from(roleplaySessions).where(eq(roleplaySessions.id, resume))
        sessionId = resume; ownerId = room!.userId
      }
      if (!resume) {
      const [owner] = await db.insert(users).values({ email: `memphoto-${Date.now()}@example.test` }).returning()
      ownerId = owner!.id
      await db.insert(userSettings).values({ userId: ownerId, timeZone: 'Asia/Seoul' })
      const now = new Date()
      await db.insert(usageWindows).values({ userId: ownerId, plan: 'pro', startedAt: now, endsAt: new Date(now.getTime() + 30 * 86_400_000), limit: 100_000_000 })
      await db.insert(userPersonas).values({ userId: ownerId, name: '지민', gender: 'female', description: '서울에 사는 20대 후반 회사원. 스토커 문제로 권재혁의 경호를 받는다.' })
      ;({ sessionId } = await createRoleplaySession(ownerId, CHARACTER))
      await db.update(roleplaySessions).set({ userNote: NOTE }).where(eq(roleplaySessions.id, sessionId))
      }
      for (const [i, line] of LINES.entries()) {
        if (i + 1 < from || i + 1 > Number(process.env.MIRO_MEMPHOTO_TO ?? LINES.length)) continue
        const r = await runConversationTurn({ userId: ownerId, sessionId, input: line.input })
        const photos = (await db.select({ content: messages.content, turn: messages.turnIndex }).from(messages)
          .where(and(eq(messages.sessionId, sessionId), eq(messages.kind, 'photo')))).filter(p => p.turn === (r.ok ? r.turnIndex : -1)).map(p => p.content)
        turns.push({ n: i + 1, input: line.input, probe: line.probe ?? null, ok: r.ok, reason: r.ok ? null : r.reason, photos, reply: r.ok ? r.responseText : null })
        // 3턴 뒤: 사용자가 기억 화면에서 복숭아 기억을 고정한 것처럼
        if (i + 1 === 3) await db.update(memories).set({ pinned: true }).where(and(eq(memories.sessionId, sessionId), sql`${memories.content} like '%복숭아%'`))
        if (!r.ok && (r.reason === 'budget' || r.reason === 'usage')) break
      }
    } finally {
      await db.update(characters).set({ situationImages: prev?.photos ?? [] }).where(eq(characters.id, CHARACTER))
      const mem = sessionId ? await db.select({ type: memories.type, content: memories.content, pinned: memories.pinned }).from(memories).where(eq(memories.sessionId, sessionId)).orderBy(asc(memories.createdAt)) : []
      const [cost] = ownerId ? await db.select({ usd: sql<string>`coalesce(sum(coalesce(${aiUsage.actualCost}, ${aiUsage.estimatedCost})), 0)` }).from(aiUsage).where(and(eq(aiUsage.userId, ownerId), gt(aiUsage.id, 0))) : [{ usd: '0' }]
      await writeFile(OUT!, JSON.stringify({ usd: Number(cost!.usd), sessionId, turns, memories: mem }, null, 2))
    }
  }, 60 * 60_000)
})
