'use server'
import { requireUser } from '@/lib/auth'
import { sendTestPush } from '@/lib/push/test-push'

export type TestPushState = { message: string | null; ok: boolean }

/** 내 기기 전부에 확인용 알림 하나. 결과는 문장으로 — 몇 대에 갔는지, 안 오면 무엇을 볼지. */
export async function testPush(_prev: TestPushState): Promise<TestPushState> {
  const user = await requireUser()
  try {
    const r = await sendTestPush(user.id)
    if (r.devices === 0) return { ok: false, message: '알림을 켠 기기가 없어요. 먼저 이 기기에서 알림을 켜 주세요.' }
    if (r.sent === 0) return { ok: false, message: `기기 ${r.devices}대가 모두 만료됐어요. 알림을 다시 켜 주세요.` }
    return { ok: true, message: `기기 ${r.sent}대에 보냈어요.${r.gone ? ` 만료된 ${r.gone}대는 뺐어요.` : ''} 몇 초 안에 도착하지 않으면 그 기기의 알림 설정을 확인해 주세요.` }
  } catch { return { ok: false, message: '지금은 알림을 보낼 수 없어요. 잠시 뒤 다시 시도해 주세요.' } }
}
