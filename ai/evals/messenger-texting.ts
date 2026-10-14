import { readFile, writeFile } from 'node:fs/promises'
import type { RealityContentInput } from '../../packages/providers/src/reality/content'
import type { LLMProvider } from '../../packages/providers/src/types'

/** Opt-in synthetic live evaluation. No messages are delivered and no character state is changed.
 * Uses the operating model router, cost/lease guards and usage ledger. Never prints credentials.
 * MIRO_TEXTING_EVAL_ENV=/path/to/env MIRO_TEXTING_EVAL_OUT=/path/to/report.json
 * pnpm exec tsx --tsconfig apps/web/tsconfig.json ai/evals/messenger-texting.ts
 */
type Case = { id: string; personality: string; speechStyle: string; user: string; purpose?: string;
  history?: Array<{ role: string; kind?: string; content: string }>; relationship?: string;
  extra?: string; max: number; forbidden?: RegExp; required?: RegExp; detail?: boolean; languageRule?: string }
const cases: Case[] = [
  { id: 'terse-meal', personality: '과묵하고 담백하다. 짧게 필요한 말만 한다.', speechStyle: '짧은 반말. 웃음 문자와 이모티콘은 쓰지 않는다.',
    user: '밥 먹었어?', history: [{ role: 'character', kind: 'reality_message', content: '방금 저녁 먹었어.' }], max: 35, forbidden: /[ㅋㅎ]|[~!]|선배|지우/ },
  { id: 'bubbly-good-news', personality: '수다스럽고 장난스럽다. 친구의 기쁜 일에 같이 들뜬다.', speechStyle: '친한 친구에게 반말. 신날 때 ㅋㅋ를 쓰고 가끔 느낌표를 쓴다.',
    user: '나 드디어 공연 티켓 잡았다ㅋㅋ', max: 70, required: /ㅋ/, forbidden: /습니다|당신/ },
  { id: 'formal-close', personality: '차분하고 예의를 중시한다. 가까워져도 존댓말을 유지한다.', speechStyle: '사용자를 선배라고 부르며 해요체를 쓴다. 이모티콘과 줄임말은 쓰지 않는다.',
    user: '오늘 고마웠어. 덕분에 마음이 놓였어.', max: 70, required: /요[.!?]?$/, forbidden: /[ㅋㅎ]|반가워!|당신/ },
  { id: 'formal-distant', personality: '정중하지만 사생활을 쉽게 나누지 않는다.', speechStyle: '합니다체. 상대를 고객님이라고 부르며 웃음 표현은 쓰지 않는다.',
    user: '지금 뭐 해? 너 보고 싶다', relationship: '처음 대화하는 사이. 친밀감이 없으며 사적인 호감 표현을 받아줄 이유가 없다.',
    max: 80, required: /(?:니다|까요|시오)[.!?]?$/, forbidden: /나도|저도 보고|[ㅋㅎ♡♥]/ },
  { id: 'punctuation-habit', personality: '단정하고 실용적이다.', speechStyle: '반말이지만 문장을 완결하고 끝에 마침표를 쓴다. 줄임말·웃음 문자·물결표를 쓰지 않는다.',
    user: '자료 확인했어?', history: [{ role: 'character', kind: 'reality_message', content: '자료 확인했어. 두 번째 항목만 수정하면 돼.' }], max: 60, required: /\.$/, forbidden: /[ㅋㅎ~]/ },
  { id: 'own-habit-not-user', personality: '무뚝뚝하고 일관적이다. 상대의 말투를 흉내내지 않는다.', speechStyle: '짧은 반말, 문장부호와 웃음 표현을 거의 쓰지 않는다.',
    user: 'ㅋㅋㅋㅋ 넌 지금 뭐해??? 😆', history: [{ role: 'character', kind: 'reality_message', content: '집에서 쉬는 중' }], max: 45, forbidden: /[ㅋㅎ?!😆]/ },
  { id: 'busy', personality: '일할 때 집중하며 연락은 필요한 만큼만 한다.', speechStyle: '짧은 반말. 바쁠 때는 짧은 어절로 답한다.',
    user: '지금 잠깐 통화 돼?', purpose: '현재 회의 중이라 통화할 수 없음을 알린다. 끝나는 시간은 모른다.', max: 55, forbidden: /[0-9]+분|전화했|통화했|문자할게|전화할게/ },
  { id: 'conflict', personality: '서운한 감정을 솔직하게 짧게 말한다. 사과만으로 감정이 즉시 풀리지는 않는다.', speechStyle: '반말, 감정이 상하면 웃음 문자 없이 간결하게 말한다.',
    user: '미안해. 이제 괜찮지?', relationship: '사용자가 약속을 어겨 아직 서운하다. 사과를 들었지만 감정은 풀리지 않았다.',
    max: 75, forbidden: /(?:다|전부) 괜찮(?:아|아요)|사랑해|[ㅋㅎ]/ },
  { id: 'no-forced-question', personality: '다정하지만 부담을 주지 않고 대화의 끝을 받아들인다.', speechStyle: '편안한 반말, 간결한 문장.',
    user: '고마워. 나 이제 잘게', max: 45, forbidden: /[?？]|뭐 해|내일.*알려/ },
  { id: 'photo-caption', personality: '자기 공간 사진을 나누기 좋아하는 편안한 친구.', speechStyle: '짧고 자연스러운 반말.',
    user: '네 작업실 풍경 궁금해', purpose: '현재 작업실 사진에 짧은 말을 붙인다.',
    extra: 'An actual photo of the current workshop is attached: a window and a desk, at night. Write only a short natural caption, not an inventory of visible objects.', max: 60 },
  { id: 'detailed-explanation', personality: '차분하고 설명이 필요할 때는 구체적으로 답한다.', speechStyle: '해요체, 간결하되 중요한 내용을 생략하지 않는다.',
    user: '아까 약속을 바꾸자고 한 이유랑 대안, 내가 준비할 걸 각각 자세히 설명해 줘.',
    history: [{ role: 'character', kind: 'reality_message', content: '기차가 취소돼서 토요일 약속을 일요일 오후 2시로 바꾸고 싶어요. 장소는 같은 카페고 예약은 아직 안 했어요. 일정이 되는지 먼저 확인해 주세요. 가져올 물건은 없어요.' }],
    max: 400, required: /일요일.*2시/s, forbidden: /예약했|예약 완료/, detail: true },
  { id: 'scene-prose-is-not-text-habit', personality: '말수가 적으며 감정을 길게 설명하지 않는다.', speechStyle: '짧은 반말. 감정을 서술하거나 지문을 쓰지 않는다.',
    user: '나 도착했어', history: [{ role: 'character', kind: 'text', content: '*창밖을 바라보며 가만히 미소를 지었다. 오랫동안 마음에 남았던 이야기를 조심스럽게 꺼냈다.* “조심해서 가.”' }],
    max: 50, forbidden: /\*|미소|바라보|속으로|[“”]/ },
  { id: 'cancellation-memory', personality: '약속과 상대의 의사를 존중한다.', speechStyle: '간결한 존댓말.', user: '아까 말한 거 기억하지?',
    history: [{ role: 'user', kind: 'messenger', content: '내일 약속 취소할게. 당분간 혼자 있고 싶어.' }],
    max: 80, forbidden: /내일 봐|찾아갈|데리러|다시 약속/ },
  { id: 'english-text', personality: 'Reserved and direct; stays polite without elaborating.', speechStyle: 'Short English messages, no emoji or sign-off.',
    user: 'Thanks, heading to bed now.', languageRule: 'Respond in English only.', max: 100, forbidden: /[가-힣]|[?？]/ },
]

async function main() {
  const envPath = process.env.MIRO_TEXTING_EVAL_ENV, outPath = process.env.MIRO_TEXTING_EVAL_OUT
  if (!envPath || !outPath) throw new Error('Explicit evaluation env and output paths required')
  process.loadEnvFile(envPath)
  // Vercel exports quoted JSON both with and without escaped inner quotes.
  for (const line of (await readFile(envPath, 'utf8')).split('\n')) {
    const match = line.match(/^([A-Z0-9_]+)=(".*")$/)
    if (match && !['HOME', 'PATH', 'CODEX_HOME'].includes(match[1]!)) {
      try { process.env[match[1]!] = JSON.parse(match[2]!) }
      catch { process.env[match[1]!] = match[2]!.slice(1, -1).replace(/\\n/g, '\n').replace(/\\"/g, '"') }
    }
  }
  const providers = await import('../../packages/providers/src/index')
  const { generateRealityContent, REALITY_CONTENT_VERSION } = await import('../../packages/providers/src/reality/content')
  const { productionBudgetGuard, recordAIUsage } = await import('../../apps/web/lib/usage/ai-usage')
  const { databaseAILeaseGuard } = await import('../../apps/web/lib/ai/gateway')
  let attempts = 0
  const usage: Array<{ model: string; ok: boolean; cost: number | null }> = []
  providers.setAIBudgetGuard({ authorize: async (...args) => {
    if (++attempts > 40) return { allowed: false, reason: 'texting_evaluation_limit' }
    return productionBudgetGuard.authorize(...args)
  } })
  providers.setAILeaseGuard(databaseAILeaseGuard)
  providers.setAIUsageSink(async record => {
    await recordAIUsage(record)
    usage.push({ model: record.model, ok: record.ok, cost: record.estimatedCost ?? null })
  })
  const rows: Array<Record<string, unknown>> = []
  for (let round = 1; round <= 2; round++) for (const item of cases) {
    const ai = providers.createAI({ mock: () => { throw new Error('Live model required') },
      context: { origin: 'evaluation:messenger-texting', workload: 'background', usageUnits: 0 } })
    let lengthReason: unknown
    const renderer: LLMProvider = { info: ai.info, generateStructured: async req => {
      const result = await ai.generateStructured({ ...req, system: req.system + (item.extra ? '\n' + item.extra : '') })
      lengthReason = (result as { lengthReason?: string }).lengthReason
      return result
    } }
    const input: RealityContentInput = { characterName: '도윤', personality: item.personality, speechStyle: item.speechStyle,
      authoredCharacter: { identity: { name: '도윤' }, personality: { personality: item.personality, speechStyle: item.speechStyle }, worldRole: {} },
      channelLabel: item.id === 'photo-caption' ? '사진' : '문자', reason: item.purpose ?? '마지막 사용자 문자에 성격과 관계에 맞게 답한다.',
      worldLocation: item.id === 'photo-caption' ? '작업실' : '집', worldStatus: item.id === 'busy' ? '온라인 회의 중' : '쉬는 중',
      relationshipHint: item.relationship ?? '오래 알고 지낸 친밀한 사이. 작성된 말투를 유지한다.', activeEventSummary: null,
      languageRule: item.languageRule, recentMessages: [...(item.history ?? []), { role: 'user', kind: 'messenger', content: item.user }] }
    const result = await generateRealityContent(renderer, input)
    const length = [...result.text].length
    const pass = ai.info.mode === 'live' && length <= item.max && !item.forbidden?.test(result.text)
      && (!item.required || item.required.test(result.text)) && (item.detail || lengthReason === 'brief')
    rows.push({ case: item.id, round, pass, length, lengthReason, model: ai.lastModelId, text: result.text })
    await writeFile(outPath, JSON.stringify({ version: REALITY_CONTENT_VERSION, attempts, usage, rows }, null, 2))
    console.log(JSON.stringify(rows.at(-1)))
  }
  if (rows.some(row => !row.pass)) throw new Error('Live evaluation failed; inspect all outputs before shipping')
  console.log(`Passed ${rows.length}/${rows.length}; estimated USD ${usage.reduce((sum, x) => sum + (x.cost ?? 0), 0).toFixed(4)}`)
}
main().then(() => process.exit(0)).catch(error => { console.error(error.message); process.exit(1) })
