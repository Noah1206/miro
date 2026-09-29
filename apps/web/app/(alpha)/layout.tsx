import type { Metadata } from 'next'
import { getT } from '@/lib/i18n/server'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT()
  return { title: 'MIRO Alpha', description: t('유진에게서 메시지가 왔어요.') }
}

/** 알파는 내비게이션 없이 화면 하나씩. 앱 폭 안에서만 그린다. */
export default function AlphaLayout({ children }: { children: React.ReactNode }) {
  return <div style={{ maxWidth: 'var(--app-w)', margin: '0 auto', minHeight: '100dvh' }}>{children}</div>
}
