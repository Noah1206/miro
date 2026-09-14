import { redirect } from 'next/navigation'
import { getAlphaSession, loadAlphaMessages } from '@/lib/alpha/session'
import { AlphaChat } from './chat'

export const dynamic = 'force-dynamic'

/** 세션이 없으면 랜딩으로 — 대화 화면은 이미 온 메시지에서 시작한다. */
export default async function AlphaChatPage() {
  const s = await getAlphaSession()
  if (!s) redirect('/alpha')
  const initial = await loadAlphaMessages(s.sessionId)
  return <AlphaChat initial={initial} hasReplied={s.turnCount > 0} />
}
