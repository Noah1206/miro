import Link from 'next/link'
import { redirect } from 'next/navigation'
import { currentUser } from '@/lib/auth'
import { listSessions, type ArchiveItem } from '@/lib/ops/archive'
import { TabBar } from '@/components/tab-bar'
import { archive, restore } from './actions'

export default async function ArchivePage({ searchParams }: { searchParams: Promise<{ tab?: string; deleted?: string }> }) {
  const user = await currentUser()
  if (!user) redirect('/login')
  const { tab, deleted } = await searchParams
  const status = tab === 'archived' ? 'archived' : 'active'
  const items = await listSessions(user.id, status)

  return (
    <main style={{ minHeight: '100dvh', padding: '28px 24px 96px' }}>
      <h1 style={{ fontSize: 22, margin: '0 0 16px' }}>Chats</h1>
      <div role="tablist" style={{ display: 'flex', gap: 6, marginBottom: 18 }}>
        <Tab href="/archive" active={status === 'active'}>진행 중</Tab>
        <Tab href="/archive?tab=archived" active={status === 'archived'}>보관됨</Tab>
      </div>
      {deleted && <p role="status" style={{ fontSize: 12.5, color: 'var(--text-secondary)', margin: '0 0 12px' }}>역할극을 삭제했습니다.</p>}

      {items.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--text-secondary)', fontSize: 14 }}>
          <p>{status === 'active' ? '진행 중인 역할극이 없습니다.' : '보관된 역할극이 없습니다.'}</p>
          <p style={{ marginTop: 14 }}><Link href="/home" style={{ textDecoration: 'underline' }}>캐릭터 탐색</Link> · <Link href="/create" style={{ textDecoration: 'underline' }}>캐릭터 만들기</Link></p>
        </div>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {items.map((s) => <Row key={s.id} s={s} archived={status === 'archived'} />)}
        </ul>
      )}
      <TabBar />
    </main>
  )
}

function Tab({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return <Link href={href} role="tab" aria-selected={active} style={{
    padding: '8px 14px', borderRadius: 999, fontSize: 13, border: '1px solid var(--border)',
    background: active ? 'var(--elevated)' : 'transparent', color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
  }}>{children}</Link>
}

/** 항목: 캐릭터 식별 + 마지막 상호작용 + 현재 장면 + 미확인 선연락. 관계 수치는 표시하지 않는다. */
function Row({ s, archived }: { s: ArchiveItem; archived: boolean }) {
  return (
    <li data-session-row style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 14 }}>
      <Link href={`/chat/${s.id}`} style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <div style={{ width: 44, height: 44, borderRadius: 12, flexShrink: 0, background: `linear-gradient(145deg, ${s.accentA ?? 'var(--accent)'}55, var(--elevated))` }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            <p style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>{s.characterName}</p>
            <p style={{ margin: 0, fontSize: 11, color: 'var(--text-secondary)', flexShrink: 0 }}>{ago(s.lastInteractionAt)}</p>
          </div>
          <p style={{ margin: '3px 0 0', fontSize: 12, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {s.characterStatus ?? `${s.location} · ${s.time}`}
          </p>
        </div>
        {s.unread > 0 && <span data-unread style={{ minWidth: 20, height: 20, padding: '0 6px', borderRadius: 999, background: 'var(--accent)', fontSize: 11, display: 'grid', placeItems: 'center' }}>{s.unread}</span>}
      </Link>
      <div style={{ display: 'flex', gap: 6, marginTop: 10, justifyContent: 'flex-end' }}>
        <form action={(archived ? restore : archive).bind(null, s.id)}>
          <button type="submit" style={pill}>{archived ? '복원' : '보관'}</button>
        </form>
        <Link href={`/archive/delete/${s.id}`} style={{ ...pill, color: 'var(--accent-strong)' }}>삭제</Link>
      </div>
    </li>
  )
}
const pill: React.CSSProperties = { padding: '6px 12px', borderRadius: 999, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 12, cursor: 'pointer' }
function ago(d: Date) {
  const m = Math.round((Date.now() - d.getTime()) / 60_000)
  if (m < 1) return '방금'; if (m < 60) return `${m}분 전`; if (m < 1440) return `${Math.floor(m / 60)}시간 전`; return `${Math.floor(m / 1440)}일 전`
}
