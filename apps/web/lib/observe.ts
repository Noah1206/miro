/**
 * 구조화 로그. 한 줄 JSON 으로 stdout 에 남긴다 (Vercel/수집기가 그대로 읽는다).
 *
 * 값 타입을 원시값으로 제한해 대화 본문 같은 객체가 실수로 실리지 않게 한다.
 * 문자열 필드에는 식별자·종류·에러 메시지만 넣는다 — 사용자 입력이나 캐릭터 응답은 넣지 않는다.
 */
export type ObserveFields = Record<string, string | number | boolean | null | undefined>

export function observe(event: string, fields: ObserveFields = {}): void {
  const line = JSON.stringify({ t: new Date().toISOString(), event, ...fields })
  if (event.endsWith('failed') || event.endsWith('error') || event.includes('.stale')) console.error(line)
  else console.info(line)
}

/** Provider 호출 지연·오류를 한 곳에서 잰다. */
export async function timed<T>(event: string, fields: ObserveFields, work: () => Promise<T>): Promise<T> {
  const t0 = Date.now()
  try {
    const out = await work()
    observe(event, { ...fields, latencyMs: Date.now() - t0, ok: true })
    return out
  } catch (e) {
    observe(`${event}.error`, { ...fields, latencyMs: Date.now() - t0, ok: false, error: (e as Error).message })
    throw e
  }
}

export function metric(name: string, startedAt: number, ok = true): number {
  const elapsedMs = Math.round((performance.now() - startedAt) * 10) / 10
  const configured = Number(process.env.PERF_SAMPLE_RATE ?? '0.05')
  const sampleRate = Number.isFinite(configured) ? Math.min(1, Math.max(0, configured)) : 0.05
  if (Math.random() < sampleRate) observe('perf.metric', { name, elapsedMs, ok })
  return elapsedMs
}

export async function measured<T>(name: string, work: () => Promise<T>): Promise<T> {
  const startedAt = performance.now()
  try {
    const result = await work()
    metric(name, startedAt)
    return result
  } catch (error) {
    metric(name, startedAt, false)
    throw error
  }
}
