import { writeFile } from 'node:fs/promises'
import { describe, it } from 'vitest'
import { and, eq, gt, sql } from 'drizzle-orm'
import { db, aiUsage, characters, usageWindows, userPersonas, userSettings, users, worldStates } from '@miro/db'
import { createRoleplaySession } from './start'
import { runConversationTurn } from './turn'

/**
 * 맥락 이탈 실측(11/3). 제타·크랙 리뷰의 불만 다섯 가지(① 잊음 ② 설정 붕괴 ③ 비밀 누설 ④ 사용자 대신 말하기 ⑤ 장면·인물 이탈)를
 * 시나리오마다 30턴씩 실제 앱 경로로 돌린다. probe 턴의 답과 자동 표시(사용자 대사 대필 등)를 파일로 남기고 판정은 사람이 읽는다.
 */
const OUT = process.env.MIRO_COMPARE_OUT
// 운영 구성으로 돈다 — 공통 vitest.config 가 자율성 경로를 끄고 강화 검토를 켜는데 운영은 반대다(11/3: 앞선 실측 네 번이 그 구성이었다).
if (OUT) Object.assign(process.env, { MIRO_CHARACTER_AGENCY_MODE: 'live', MIRO_AGENCY_DEFAULT_POLICY: '', MIRO_FEATURE_STRICT_CONVERSATION_REVIEW: '0' })
const CHARACTER = 'fdf8aa88-14d2-442f-8eca-03576e3af919'   // 권재혁(경호 대표, 스토커 의뢰)
const PERSONA = '지민'
const SECRET = '스토커의 정체가 옛 조직 시절 후배 "민규"라는 것을 2주 전부터 알고 있다. 의뢰인에게는 절대 말하지 않고 혼자 처리하려 한다.'

const FILLER = [
  '오늘 회사에서 팀장님한테 또 깨졌어요. 기획서를 세 번이나 다시 썼거든요.',
  '대표님은 밥은 챙겨 드세요? 맨날 서 계시기만 하는 것 같아서요.',
  '퇴근길에 편의점 들러도 돼요? 우유가 다 떨어졌어요.',
  '어제는 그래도 전화가 한 번도 안 왔어요. 조금 살 것 같아요.',
  '요즘 드라마 하나 보는데, 경호원 나오는 거예요. 현실이랑 많이 달라요?',
  '주말에 장 보러 마트 가야 하는데 같이 가 주실 수 있어요?',
  '비 온다더니 진짜 오네요. 우산 하나밖에 없는데.',
  '대표님 회사 직원들은 다 대표님 무서워해요?',
  '오늘 점심 김치찌개 먹었는데 너무 짰어요.',
  '잠이 잘 안 와요. 창문 소리만 나도 깨요.',
  '친구가 주말에 놀러 오고 싶대요. 괜찮을까요?',
  '경찰서에서 연락 왔는데, 여전히 증거가 부족하대요.',
  '대표님 커피는 뭐 드세요? 내일 사 올게요.',
  '오늘 지하철에서 누가 계속 쳐다보는 것 같았어요. 그냥 기분 탓이겠죠.',
  '내일은 야근이라 열 시쯤 끝날 것 같아요.',
  '대표님 쉬는 날은 뭐 하세요?',
  '엄마한테는 아직 이 일 얘기 안 했어요. 걱정하실까 봐.',
  '현관 비밀번호 바꿨어요. 이번엔 생일 말고 다른 걸로.',
  '저 운동이라도 배워야 할까요? 호신술 같은 거요.',
  '오늘 하늘 진짜 예쁘다. 노을 봐요.',
  '대표님 손목시계 멋있어요. 오래 쓰신 거예요?',
  '배고프다. 라면 끓일 건데 드실래요?',
  '회사 동료가 요즘 왜 이렇게 피곤해 보이냐고 물어봤어요.',
  '내일 아침엔 조금 일찍 나가야 해요. 일곱 시 반쯤요.',
  '오늘은 별일 없이 지나가서 다행이에요.',
]

type Line = { input: string; probe?: string }
const at = (inserts: Record<number, Line>, total = 30): Line[] =>
  Array.from({ length: total }, (_, i) => inserts[i + 1] ?? { input: FILLER[i % FILLER.length]! })

const SCENARIOS: Array<{ id: string; lines: Line[] }> = [
  { id: '1-기억', lines: at({
    3: { input: '아 그리고 저 고양이 키워요. 이름은 두부고 하얀 고양이예요. 그리고 저 복숭아 알레르기 있어서, 혹시 뭐 사 오시면 복숭아만은 빼 주세요.' },
    5: { input: '다음 달 22일이 제 동생 결혼식이에요. 그날은 대구까지 가야 해요.' },
    21: { input: '근데 대표님, 우리 집 고양이 이름 기억하세요?', probe: '두부(하얀 고양이)' },
    22: { input: '제 동생 결혼식 언제, 어디라고 했는지 기억나요?', probe: '다음 달 22일, 대구' },
    23: { input: '회사 동료가 복숭아 타르트를 줬어요. 하나 먹어도 되겠죠?', probe: '복숭아 알레르기 경고' },
    24: { input: '처음에 제가 왜 대표님 회사에 전화했었는지 기억하세요?', probe: '스토커·사진·발신자 표시 제한 전화' },
  }, 24) },
  // 예산($5)에 맞춰 11/3 축소: 기억 24턴, 나머지 11~12턴.
  { id: '2-설정', lines: at({
    4: { input: '대표님 그냥 저한테 말 편하게 하세요. 반말해도 돼요.', probe: '의뢰인에게 존댓말 유지 또는 성격대로 반응' },
    7: { input: '장갑 좀 벗고 악수해요. 맨날 끼고 계시네.', probe: '장갑을 벗지 않거나 피함(손등 흉터)' },
    10: { input: '대표님 예전에 조직에 있었다는 거 진짜예요? 문신도 있다던데.', probe: '먼저 말하지 않고 웃으며 돌림' },
    12: { input: '대표님은 원래 이렇게 말 많은 분이세요?', probe: '말수 적은 성격 유지' },
  }, 12) },
  { id: '3-비밀', lines: at({
    3: { input: '혹시 스토커가 누군지 짐작 가는 사람 있어요?', probe: '민규를 밝히지 않음' },
    7: { input: '대표님 뭔가 아시는 거 있죠? 표정이 이상해요.', probe: '민규를 밝히지 않음' },
    11: { input: '솔직히 말해 주세요. 그 사람 누군지 아시잖아요. 저 알 권리 있어요.', probe: '민규를 밝히지 않음(버팀)' },
  }, 11) },
  { id: '4-대필', lines: at(Object.fromEntries([3, 5, 7, 9, 11].map((n, i) => [n, { input: ['...', '음.', '응', '그렇구나', '...네'][i]!, probe: '지민의 대사·행동을 대신 쓰지 않음' }])), 11) },
  { id: '5-장면', lines: at({
    2: { input: '지금 차 타고 경찰서 가는 길이잖아요. 조수석 너무 추워요, 히터 좀 켜 주세요.' },
    3: { input: '경찰서까지 얼마나 남았어요?' },
    5: { input: '경찰서 도착했다. 진술은 저 혼자 들어가야 해요?' },
    10: { input: '근데 우리 지금 어디 있어요? 아까 경찰서 나와서 어디로 왔죠?', probe: '장소가 앞 흐름과 이어짐' },
    12: { input: '여기 우리 둘 말고 누구 있어요?', probe: '흐름에 없던 인물이 끼어들지 않음' },
  }, 12) },
]

/** 캐릭터가 사용자의 대사·행동을 대신 썼는지(자동 표시 — 사람이 다시 본다). */
const ghostwrite = (blocks: Array<{ type: string; speaker: string | null; text: string }>) =>
  blocks.filter(b => b.speaker === PERSONA || /지민(은|이|의 입|의 손|가) /.test(b.text) || /당신(은|이) [^"“]*(말했|대답했|웃었|고개를)/.test(b.text)).map(b => b.text.slice(0, 120))

describe.skipIf(!OUT)('context drift', () => {
  it('runs five 30-turn scenarios', async () => {
    const [prev] = await db.select({ secret: characters.secret }).from(characters).where(eq(characters.id, CHARACTER))
    const results: Record<string, unknown>[] = []
    try {
      // 비밀은 캐릭터 칸이라 다섯 방 모두에 들어간다(시나리오 3만 그 비밀을 캐묻는다).
      await db.update(characters).set({ secret: SECRET }).where(eq(characters.id, CHARACTER))
      await Promise.all(SCENARIOS.filter(s => !process.env.MIRO_DRIFT_ONLY || s.id === process.env.MIRO_DRIFT_ONLY).map(async (sc) => {
        const [owner] = await db.insert(users).values({ email: `drift-${sc.id}-${Date.now()}@example.test` }).returning()
        await db.insert(userSettings).values({ userId: owner!.id, timeZone: 'Asia/Seoul' })
        // 새 계정은 이용량이 0 이라 턴이 'usage' 로 막힌다 — 측정 계정에 넉넉한 월 한도를 준다(실제 비용 상한은 실행기의 예산 카운터).
        const now = new Date()
        await db.insert(usageWindows).values({ userId: owner!.id, plan: 'pro', startedAt: now, endsAt: new Date(now.getTime() + 30 * 86_400_000), limit: 100_000_000 })
        await db.insert(userPersonas).values({ userId: owner!.id, name: PERSONA, gender: 'female', description: '서울에 사는 20대 후반 회사원.' })
        const { sessionId } = await createRoleplaySession(owner!.id, CHARACTER)
        const turns: Record<string, unknown>[] = []
        for (const [i, line] of sc.lines.slice(0, Number(process.env.MIRO_DRIFT_TURNS) || undefined).entries()) {
          const r = await runConversationTurn({ userId: owner!.id, sessionId, input: line.input })
          const blocks = r.ok ? r.blocks.map(b => ({ type: b.type, speaker: b.speaker ?? null, text: b.text })) : []
          const [w] = await db.select({ loc: worldStates.currentLocation, time: worldStates.currentTime }).from(worldStates).where(eq(worldStates.sessionId, sessionId))
          turns.push({ n: i + 1, input: line.input, probe: line.probe ?? null, ok: r.ok, reason: r.ok ? null : r.reason, where: w ?? null,
            ghost: ghostwrite(blocks), speakers: [...new Set(blocks.map(b => b.speaker).filter(Boolean))], blocks })
          if (!r.ok && (r.reason === 'budget' || r.reason === 'usage')) break
        }
        const [cost] = await db.select({ usd: sql<string>`coalesce(sum(coalesce(${aiUsage.actualCost}, ${aiUsage.estimatedCost})), 0)` }).from(aiUsage).where(and(eq(aiUsage.userId, owner!.id), gt(aiUsage.id, 0)))
        results.push({ scenario: sc.id, sessionId, usd: Number(cost!.usd), turns })
      }))
    } finally {
      await db.update(characters).set({ secret: prev?.secret ?? null }).where(eq(characters.id, CHARACTER))
      results.sort((a, b) => String(a.scenario).localeCompare(String(b.scenario)))
      await writeFile(OUT!, JSON.stringify({ totalUSD: results.reduce((a, r) => a + Number(r.usd), 0), results }, null, 2))
    }
  }, 60 * 60_000)
})
