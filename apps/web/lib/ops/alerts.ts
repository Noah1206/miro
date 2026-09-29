import { and, eq, gte, lt, sql } from 'drizzle-orm'
import { db, aiBudgetCounters, aiUsage, bankTransferOrders, opsAlerts, opsBackupRuns, realityPushJobs } from '@miro/db'
import { budgetPolicy, startOfDayKST } from '@/lib/usage/ai-usage'
import { observe } from '@/lib/observe'

export type OpsAlert = { key: string; title: string; detail: string }

/** 같은 알림은 이 간격 안에 다시 보내지 않는다. */
const REPEAT_MS = 6 * 3600_000
/** 백업은 하루 한 번(03시 KST)인데 GitHub 스케줄이 몇 시간씩 밀리므로 하루 반을 넘겨야 멈춘 것으로 본다. */
const BACKUP_STALE_MS = 36 * 3600_000
const CONNECTED: OpsAlert = { key: 'connected', title: 'MIRO 운영자 알림 연결됨', detail: '이 채널로 AI 제공자 장애, 일일 예산 소진, 24시간 넘은 입금 대기, 푸시 발송 실패, 정기 백업 멈춤을 알려요.' }

/**
 * 운영자가 알아야 할 상태만 고른다 — 사용자에게 가는 알림이 아니다.
 * 출시 게이트 "제공자 장애와 예산 소진이 운영자에게 닿는다" 의 구현. 판단은 전부 DB 기록으로 한다.
 */
export async function collectOpsAlerts(now = new Date()): Promise<OpsAlert[]> {
  const out: OpsAlert[] = []
  const quarter = new Date(now.getTime() - 15 * 60_000)
  const [ai] = await db.select({
    total: sql<number>`count(*)::int`, failed: sql<number>`count(*) filter (where not ${aiUsage.ok})::int`,
    lastError: sql<string | null>`max(${aiUsage.error}) filter (where not ${aiUsage.ok})`,
  }).from(aiUsage).where(gte(aiUsage.createdAt, quarter))
  if (ai && ai.total >= 3 && ai.failed * 2 >= ai.total) {
    out.push({ key: 'ai_failures', title: 'AI 제공자 장애 의심', detail: `최근 15분 호출 ${ai.total}건 중 ${ai.failed}건 실패. 마지막 오류: ${(ai.lastError ?? '').slice(0, 120) || '기록 없음'}` })
  }

  const limit = budgetPolicy().global ?? {}
  const [today] = await db.select().from(aiBudgetCounters).where(eq(aiBudgetCounters.key, `${startOfDayKST(now).toISOString()}:global`))
  if (today) {
    const cost = Number(today.cost)
    if (limit.cost && cost >= limit.cost * 0.8) {
      out.push({ key: 'budget_cost', title: cost >= limit.cost ? 'AI 일일 예산 소진' : 'AI 일일 예산 80% 도달', detail: `오늘 $${cost.toFixed(3)} / 상한 $${limit.cost}. 소진되면 새 생성이 멈춰요.` })
    }
    if (limit.requests && today.requests >= limit.requests * 0.8) {
      out.push({ key: 'budget_requests', title: today.requests >= limit.requests ? 'AI 일일 호출 한도 소진' : 'AI 일일 호출 한도 80% 도달', detail: `오늘 ${today.requests}회 / 상한 ${limit.requests}회` })
    }
  }

  const dayAgo = new Date(now.getTime() - 24 * 3600_000)
  const [orders] = await db.select({ n: sql<number>`count(*)::int` }).from(bankTransferOrders)
    .where(and(eq(bankTransferOrders.status, 'awaiting'), lt(bankTransferOrders.createdAt, dayAgo), gte(bankTransferOrders.expiresAt, now)))
  if (orders && orders.n > 0) {
    out.push({ key: 'orders_waiting', title: '입금 대기 주문 확인 필요', detail: `24시간 넘게 입금 대기 중인 주문 ${orders.n}건. 통장을 확인하고 운영자 앱 /payments 에서 승인하거나 거절해 주세요.` })
  }

  const [push] = await db.select({ n: sql<number>`count(*)::int` }).from(realityPushJobs)
    .where(and(eq(realityPushJobs.status, 'failed'), gte(realityPushJobs.createdAt, dayAgo)))
  if (push && push.n >= 3) out.push({ key: 'push_failed', title: '푸시 발송 실패 누적', detail: `최근 24시간 실패 ${push.n}건` })

  // 백업이 한 번도 없던 때(설정 전)는 조용히 둔다 — 한 번 돌기 시작한 백업이 멈추는 것을 잡는다.
  // 이 조회가 실패해도(표 누락 등) 위에서 모은 알림은 보내야 한다 — 따로 잡아 그 자체를 알림으로 올린다.
  try {
    const [backup] = await db.select({ at: sql<string | null>`max(${opsBackupRuns.finishedAt})::text` }).from(opsBackupRuns)
    const lastBackup = backup?.at ? new Date(backup.at) : null
    if (lastBackup && now.getTime() - lastBackup.getTime() > BACKUP_STALE_MS) {
      const hours = Math.floor((now.getTime() - lastBackup.getTime()) / 3600_000)
      out.push({ key: 'backup_stale', title: '정기 백업 멈춤', detail: `마지막으로 보관된 백업이 ${hours}시간 전이에요. GitHub 비공개 저장소 miro-backups 의 Actions 실행 기록을 확인해 주세요.` })
    }
  } catch (e) {
    out.push({ key: 'backup_check_failed', title: '백업 상태 확인 실패', detail: `ops_backup_runs 를 읽지 못했어요: ${(e as Error).message.slice(0, 120)}` })
  }
  return out
}

/**
 * 유지보수 크론(15분)마다 부른다. Discord 웹훅(MIRO_OPS_DISCORD_WEBHOOK)이 없으면 세기만 하고 보내지 않는다.
 * 웹훅을 처음 본 뒤 한 번 '연결됨' 인사를 보내 채널이 살아 있는지 확인시켜 준다.
 */
export async function notifyOperators(now = new Date()): Promise<{ alerts: number; sent: number }> {
  const webhook = process.env.MIRO_OPS_DISCORD_WEBHOOK
  const alerts = await collectOpsAlerts(now)
  if (!webhook) {
    if (alerts.length) observe('ops.alerts_unsent', { keys: alerts.map((a) => a.key).join(',') })
    return { alerts: alerts.length, sent: 0 }
  }
  const cutoff = new Date(now.getTime() - REPEAT_MS)
  let sent = 0
  for (const a of [CONNECTED, ...alerts]) {
    const [prev] = await db.select({ at: opsAlerts.lastSentAt }).from(opsAlerts).where(eq(opsAlerts.key, a.key))
    if (prev && (a.key === CONNECTED.key || prev.at > cutoff)) continue
    if (!(await postDiscord(webhook, `**${a.title}**\n${a.detail}`))) { observe('ops.alert_failed', { key: a.key }); continue }
    await db.insert(opsAlerts).values({ key: a.key, lastSentAt: now, detail: a.detail })
      .onConflictDoUpdate({ target: opsAlerts.key, set: { lastSentAt: now, detail: a.detail } })
    sent++
  }
  return { alerts: alerts.length, sent }
}

/**
 * 알림이 아닌 운영 기록 한 줄(반복 억제 없음). 웹훅이 없으면 보내지 않고 false.
 * DB 밖에 남아야 하는 사실(예: 계정 삭제 — 백업에서 복구하면 되살아난다)을 운영자 채널에 적어 둔다.
 */
export async function postOperatorNote(content: string): Promise<boolean> {
  const webhook = process.env.MIRO_OPS_DISCORD_WEBHOOK
  return webhook ? postDiscord(webhook, content) : false
}

async function postDiscord(url: string, content: string): Promise<boolean> {
  try {
    const r = await fetch(url, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'MIRO 운영', content: content.slice(0, 1900) }),
      signal: AbortSignal.timeout(5000),
    })
    return r.ok
  } catch { return false }
}
