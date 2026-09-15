import { and, eq, gt, isNull, lte, or, sql } from 'drizzle-orm'
import { db, subscriptions, pushSubscriptions, users, userSettings } from '@miro/db'
import { POLICY, productionRuntime } from '@miro/config'
import { inQuietHours } from '@miro/domain'
import { resolvePush } from '@miro/providers'
import { observe } from '@/lib/observe'
import { COPY } from '@/lib/copy'

/** 만료 며칠 전에 알릴지. 계좌이체는 입금 확인까지 시간이 걸려 하루로는 부족하다. */
const NOTICE_DAYS_BEFORE = 3

/**
 * 이용권 만료 안내. 자동 갱신이 없으므로 끝나기 전에 알려야 이어서 쓸 수 있다.
 *
 * 단계는 두 번뿐이다 — 만료 3일 전(`soon`), 만료 당일(`ended`). 보낸 단계를 행에 남겨
 * 15분마다 도는 cron 이 같은 안내를 다시 보내지 않게 한다. 사용자가 소진 알림을 원하지
 * 않는다고 했으므로 사용량에 대해서는 아무것도 보내지 않는다 — 여기는 기간 만료만 다룬다.
 *
 * ponytail: 대상이 만료 임박한 이용권뿐이라 배치가 작다. 건수가 늘면 realityPushJobs 처럼
 * lease 를 둔 outbox 로 옮긴다.
 */
export async function notifyExpiringPasses(now = new Date()): Promise<{ soon: number; ended: number }> {
  const soonAt = new Date(now.getTime() + NOTICE_DAYS_BEFORE * 86_400_000)
  const rows = await db.select({ sub: subscriptions, user: users, settings: userSettings })
    .from(subscriptions)
    .innerJoin(users, eq(users.id, subscriptions.userId))
    .leftJoin(userSettings, eq(userSettings.userId, subscriptions.userId))
    .where(and(
      isNull(users.deletedAt),
      lte(subscriptions.currentPeriodEnd, soonAt),
      or(isNull(subscriptions.expiryNotice), eq(subscriptions.expiryNotice, 'soon')),
      // 환불로 이미 끝난 이용권은 안내하지 않는다.
      or(eq(subscriptions.status, 'active'), eq(subscriptions.status, 'cancelled')),
    ))
    .limit(200)

  const counts = { soon: 0, ended: 0 }
  for (const row of rows) {
    const ended = row.sub.currentPeriodEnd <= now
    const stage: 'soon' | 'ended' = ended ? 'ended' : 'soon'
    if (row.sub.expiryNotice === stage) continue
    // 3일 전 안내를 놓친 채 이미 만료됐다면 'ended' 만 보낸다 — 지난 예고를 뒤늦게 보내지 않는다.

    const settings = {
      pushEnabled: row.settings?.pushEnabled ?? true,
      voiceCallEnabled: false, videoCallEnabled: false,
      quietHoursEnabled: row.settings?.quietHoursEnabled ?? POLICY.quietHours.defaultEnabled,
      quietHoursStart: row.settings?.quietHoursStart ?? POLICY.quietHours.defaultStart,
      quietHoursEnd: row.settings?.quietHoursEnd ?? POLICY.quietHours.defaultEnd,
      timeZone: row.settings?.timeZone ?? POLICY.reality.defaultTimeZone,
    }
    // Quiet Hours 에는 보내지 않고 단계도 남기지 않는다 — 다음 cron 이 깨어 있는 시간에 보낸다.
    if (settings.quietHoursEnabled && inQuietHours(now, settings)) continue

    const mark = () => db.update(subscriptions)
      .set({ expiryNotice: stage, updatedAt: now })
      .where(and(eq(subscriptions.id, row.sub.id), sql`${subscriptions.expiryNotice} IS NOT DISTINCT FROM ${row.sub.expiryNotice}`))

    if (settings.pushEnabled === false) { await mark(); continue }

    const targets = await db.select().from(pushSubscriptions)
      .where(and(eq(pushSubscriptions.userId, row.sub.userId), isNull(pushSubscriptions.failedAt)))
    // 보낼 기기가 없어도 단계는 남긴다. 기기가 생겼다고 지난 안내를 소급 발송하지 않는다.
    if (!targets.length) { await mark(); continue }

    const copy = ended ? COPY.pass.endedPush : COPY.pass.soonPush
    let delivered = false
    for (const target of targets) {
      try {
        const provider = resolvePush()
        if (productionRuntime() && provider.info.mode !== 'live') throw new Error('PUSH_NOT_READY')
        const result = await provider.send(target, {
          title: copy.title, body: copy.body, url: '/my/subscription',
          // 같은 단계의 알림은 기기에서 하나로 합쳐진다.
          tag: `pass:${row.sub.id}:${stage}`,
        })
        if (result.ok) delivered = true
        else if (result.gone) await db.update(pushSubscriptions).set({ failedAt: now }).where(eq(pushSubscriptions.id, target.id))
      } catch {
        observe('pass.notice_failed', { userId: row.sub.userId, stage })
      }
    }
    // 한 대라도 받았으면 완료. 전부 실패하면 단계를 남기지 않아 다음 cron 이 다시 시도한다.
    if (delivered) { await mark(); counts[stage]++ }
  }
  return counts
}
