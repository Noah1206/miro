import Link from 'next/link'

export function TabBar() {
  const items = [
    { href: '/home', label: 'Home' },
    { href: '/archive', label: 'Chats' },
    { href: '/my', label: 'My' },
  ]
  return (
    <nav style={{
      position: 'fixed', left: 0, right: 0, bottom: 0,
      display: 'flex', borderTop: '1px solid var(--border)',
      background: 'var(--bg)', paddingBottom: 'env(safe-area-inset-bottom)',
    }}>
      {items.map((i) => (
        <Link key={i.href} href={i.href} style={{
          flex: 1, textAlign: 'center', padding: '16px 0',
          fontSize: 12, color: 'var(--text-secondary)',
        }}>{i.label}</Link>
      ))}
    </nav>
  )
}
