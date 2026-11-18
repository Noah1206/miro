import { redirect } from 'next/navigation'
import { currentAdmin } from '@/lib/auth'
import { LiveProvider, Tabs } from './live-client'
import s from './live.module.css'

export const metadata = { title: 'MIRO Live' }

/** 11/18 실시간 현황 — 운영자만. 아래 모든 화면이 실시간 연결 하나를 같이 쓴다. */
export default async function LiveLayout({ children }: { children: React.ReactNode }) {
  if (!await currentAdmin()) redirect('/login')
  return <LiveProvider><div className={s.shell}><Tabs />{children}</div></LiveProvider>
}
