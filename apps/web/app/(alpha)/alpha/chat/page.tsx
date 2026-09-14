import { redirect } from 'next/navigation'
import { getAlphaSession } from '@/lib/alpha/session'
import { AlphaChat } from './chat'

/** 세션이 없으면 랜딩으로 — 대화 화면은 이미 온 메시지에서 시작한다. */
export default async function AlphaChatPage() {
  const s = await getAlphaSession()
  if (!s) redirect('/alpha')
  return <AlphaChat initial={s.messages} hasReplied={s.userMessages > 0} />
}
