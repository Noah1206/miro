import type { Instrumentation } from 'next'

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { installAIUsageSink } = await import('./lib/usage/ai-usage')
    installAIUsageSink()
  }
}

/**
 * 서버 오류를 운영자 Discord(MIRO_OPS_DISCORD_WEBHOOK)로 보낸다 — 오류 추적 서비스 대신(10/5).
 * 같은 경로·같은 메시지는 인스턴스당 10분에 한 번만. 사용자 입력·쿠키·헤더는 보내지 않는다(경로와 오류 메시지·digest 만).
 * ponytail: 인스턴스 메모리 억제라 인스턴스가 여럿이면 같은 오류가 몇 번 올 수 있다 — 많아지면 ops_alerts 표로.
 */
const recent = new Map<string, number>()
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  const e = error as Error & { digest?: string }
  const path = request.path.split('?')[0]
  const key = `${path}|${e.message?.slice(0, 120)}`
  const now = Date.now()
  if ((recent.get(key) ?? 0) > now - 10 * 60_000) return
  recent.set(key, now)
  if (recent.size > 200) recent.clear()
  const { postOperatorNote } = await import('./lib/ops/alerts')
  await postOperatorNote([
    `**서버 오류** \`${request.method} ${path}\` (${context.routeType} · ${context.routePath})`,
    `${e.name}: ${e.message?.slice(0, 500)}`,
    e.digest ? `digest ${e.digest}` : '',
    '```' + (e.stack ?? '').split('\n').slice(1, 6).join('\n').slice(0, 800) + '```',
  ].filter(Boolean).join('\n')).catch(() => false)
}
