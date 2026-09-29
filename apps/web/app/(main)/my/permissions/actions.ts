'use server'
import { requireUser } from '@/lib/auth'
import { sendTestPush } from '@/lib/push/test-push'
import { getT } from '@/lib/i18n/server'

export type TestPushState = { message: string | null; ok: boolean }

/** 내 기기 전부에 확인용 알림 하나. 결과는 문장으로 — 몇 대에 갔는지, 안 오면 무엇을 볼지. */
export async function testPush(_prev: TestPushState): Promise<TestPushState> {
  const user = await requireUser()
  const t = await getT()
  try {
    const r = await sendTestPush(user.id)
    if (r.devices === 0) return { ok: false, message: t('알림을 켠 기기가 없어요. 먼저 이 기기에서 알림을 켜 주세요.') }
    if (r.sent === 0) return { ok: false, message: t('기기 {n}대가 모두 만료됐어요. 알림을 다시 켜 주세요.', { n: r.devices }) }
    return { ok: true, message: [
      t('기기 {n}대에 보냈어요.', { n: r.sent }),
      r.gone ? t('만료된 {n}대는 뺐어요.', { n: r.gone }) : '',
      t('몇 초 안에 도착하지 않으면 그 기기의 알림 설정을 확인해 주세요.'),
    ].filter(Boolean).join(' ') }
  } catch { return { ok: false, message: t('지금은 알림을 보낼 수 없어요. 잠시 뒤 다시 시도해 주세요.') } }
}
