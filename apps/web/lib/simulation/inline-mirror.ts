import { BRIDGE_SYSTEM, EXPLICIT, bridgePrompt, sanitizeBridge } from '@/lib/simulation/unveil-bridge'

/**
 * 인라인 세션 미러링(10/27). 한 방 안에서 언베일 모델이 쓴 원문(is_explicit)은 화면에는 그대로 두고,
 * 상용 모델(Claude·Gemini)로 가는 대화 기록에서는 줄거리 요약으로 바꿔 보낸다 — 원문은 공급자에게 가지 않는다.
 * 요약은 b33d86de 의 다리와 같은 프롬프트·단어 검사를 쓴다. 검사를 못 넘으면 고정 문장으로 대신한다(fail closed).
 * 켜는 스위치: MIRO_INLINE_MIRROR=1 (꺼져 있으면 예전처럼 방 단위로만 분리).
 */
export type HistoryMessage = { id?: string; role: string; content: string; isExplicit?: boolean }

export const MASKED_FALLBACK = '두 사람은 이어서 사적인 시간을 보냈고, 관계가 한층 가까워졌다.'

export const inlineMirrorEnabled = () => process.env.MIRO_INLINE_MIRROR === '1'

/**
 * 이번 턴을 언베일 모델로 보낼까. gateAllowed(인증·동의·캐릭터 19+·페르소나·언베일 켜짐)가 먼저고,
 * 입력에 성인 맥락이 보이거나 직전 답이 언베일 모델 것이었을 때만 true. 입력 감지만으로는 절대 넘어가지 않는다.
 * ponytail: 한 번 넘어가면 직전 답이 계속 원문이라 방에 머문다 — 일반으로 돌아오기는 언베일 스위치를 끄는 것뿐. 장면 전환 감지는 필요할 때.
 */
export function decideAdultTurn(o: { gateAllowed: boolean; input: string; lastExplicit: boolean }): boolean {
  return o.gateAllowed && (o.lastExplicit || EXPLICIT.test(o.input))
}

/** 연속된 원문 한 덩어리를 요약한다. 성인 전용 모델로만 부를 것(auxiliaryLLM adult: true). */
export type Summarize = (run: HistoryMessage[]) => Promise<string>

// 같은 구간은 한 번만 요약한다. 프로세스 안 캐시라 서버 인스턴스마다 처음 한 번은 다시 만든다.
// ponytail: 인스턴스 메모리 500개 — 지연이 문제면 memories 표로 옮긴다.
const CACHE_MAX = 500
const summaryCache = new Map<string, string>()

export async function maskExplicitHistory<T extends HistoryMessage>(history: T[], summarize: Summarize): Promise<T[]> {
  const out: T[] = []
  for (let i = 0; i < history.length;) {
    if (!history[i]!.isExplicit) { out.push(history[i]!); i++; continue }
    // 연속 구간 하나 = 요약 한 번. 요약 호출이 실패해도 원문은 절대 내보내지 않는다.
    let j = i
    while (j < history.length && history[j]!.isExplicit) j++
    const run = history.slice(i, j)
    const key = run.every(m => m.id) ? run.map(m => m.id).join(',') : null
    let summary = key ? summaryCache.get(key) ?? null : null
    if (!summary) {
      summary = await summarize(run).then(sanitizeBridge).catch(() => null)
      if (summary && key) {
        summaryCache.set(key, summary)
        if (summaryCache.size > CACHE_MAX) summaryCache.delete(summaryCache.keys().next().value!)
      }
    }
    // blocks 에도 원문이 있다 — 비운다.
    out.push({ ...run[0]!, role: 'narrator', content: `[이전 서사 요약] ${summary ?? MASKED_FALLBACK}`, blocks: [], isExplicit: false })
    i = j
  }
  return out
}

/** 언베일 전용 모델 호출을 Summarize 로 감싼다. makeLLM 은 auxiliaryLLM(..., { adult: true }) — 모델이 없으면 던지고, 위에서 고정 문장이 된다. */
export function bridgeSummarizer(makeLLM: () => { generateStructured: (r: any) => Promise<{ summary: string }> }, schema: unknown, characterName: string): Summarize {
  return async run => (await makeLLM().generateStructured({ schema, task: 'memory_summary', system: BRIDGE_SYSTEM,
    prompt: bridgePrompt(characterName, run), promptVersion: 'inline-mirror:v1', maxTokens: 700, temperature: 0.3 })).summary
}
