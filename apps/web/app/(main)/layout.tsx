import { Nav } from '@/components/ui/nav'

/** 모바일: 하단 내비 + 페이지. 데스크톱: 왼쪽 내비 + 메인. 장면 화면(chat/live/call)에서는 내비가 스스로 사라진다. */
export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-shell">
      <Nav />
      <div style={{ minWidth: 0 }}>{children}</div>
    </div>
  )
}
