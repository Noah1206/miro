'use client'
import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { loadArchivePage } from '@/app/(main)/archive/actions'
import type { ArchivePage } from '@/lib/ops/archive'
import { preview, dateLabel } from '@/lib/archive-format'
import { useT } from '@/lib/i18n/client'
import { CharacterPhoto } from '@/components/character-visual'
import { TransitionLink } from './transition-link'
import { SocialButton, type LoginProvider } from './social-button'
import { LogoMark } from './logo'
import styles from './desktop-chats.module.css'

export function DesktopChats({ signedIn, providers, collapsed, onToggle }: { signedIn: boolean; providers: LoginProvider[]; collapsed: boolean; onToggle: () => void }) {
  const pathname = usePathname()
  const t = useT()
  const [page, setPage] = useState<ArchivePage | null>(null)
  const [error, setError] = useState(false)
  const [retry, setRetry] = useState(0)
  const [loadingMore, setLoadingMore] = useState(false)
  useEffect(() => {
    const desktop = window.matchMedia('(min-width: 1024px)')
    let disposed = false
    const refresh = () => {
      if (!desktop.matches || !signedIn) return
      setError(false)
      loadArchivePage().then(value => { if (!disposed) setPage(value) }).catch(() => { if (!disposed) setError(true) })
    }
    if (!signedIn) setPage(null)
    refresh()
    desktop.addEventListener('change', refresh)
    window.addEventListener('focus', refresh)
    return () => { disposed = true; desktop.removeEventListener('change', refresh); window.removeEventListener('focus', refresh) }
    // 페이지를 옮길 때마다 읽지 않는다(10/27) — 대화방·캐릭터 화면에서는 내비와 함께 사라졌다가 돌아올 때 다시 그려지며 읽는다.
  }, [signedIn, retry])
  async function more() {
    if (!page?.nextCursor || loadingMore) return
    setLoadingMore(true)
    try {
      const next = await loadArchivePage(page.nextCursor)
      setPage(current => current ? { items: [...current.items, ...next.items.filter(item => !current.items.some(old => old.id === item.id))], nextCursor: next.nextCursor } : next)
      setError(false)
    } catch { setError(true) }
    finally { setLoadingMore(false) }
  }
  return <aside className={styles.sidebar} data-collapsed={collapsed} aria-label={t('대화')}>
    <div className={styles.brandRow}>
      {collapsed ? <button className={styles.expand} onClick={onToggle} aria-label="사이드바 열기" aria-expanded={false}><span className={styles.expandLogo}><LogoMark size={28} label="" /></span><svg className={styles.expandIcon} width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="3" y="4" width="18" height="16" rx="3"/><path d="M9 4v16m4-12 3 4-3 4"/></svg></button> : <>
        <TransitionLink href="/home" className={styles.brand}><LogoMark size={28} /><span>MIRO</span></TransitionLink>
        <button className={styles.toggle} onClick={onToggle} aria-label="사이드바 닫기" aria-expanded={true}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden><rect x="3" y="4" width="18" height="16" rx="3"/><path d="M9 4v16m7-12-3 4 3 4"/></svg></button>
      </>}
    </div>
    <div className={styles.body} inert={collapsed} aria-hidden={collapsed}>
    {signedIn && <div className={styles.heading}><h2>{t('채팅')}</h2><TransitionLink href="/archive">{t('대화 관리')}</TransitionLink></div>}
    {signedIn ? <div className={styles.list}>
      {!page && !error && <p role="status" className={styles.empty}>{t('불러오는 중…')}</p>}
      {page?.items.length === 0 && <p className={styles.empty}>{t('아직 대화가 없어요')}</p>}
      {page?.items.map(s => <TransitionLink key={s.id} href={s.href ?? `/chat/${s.id}`} className={styles.row}>
        <div className={styles.avatar}>{s.characterImage ? <CharacterPhoto src={s.characterImage} alt="" size="avatar" sizes="42px" width={42} height={42} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : s.characterName.slice(0, 1)}</div>
        <div className={styles.copy}><strong>{s.characterName}</strong>{s.storyTitle && <small>{s.storyTitle} · {t('{n}회차', { n: s.runNo! })}</small>}<p>{s.lastMessage ? preview(s.lastMessage, s.characterName) : s.characterStatus ?? `${s.location} · ${s.time}`}</p></div>
        <div className={styles.meta}><time dateTime={new Date(s.lastInteractionAt).toISOString()}>{dateLabel(s.lastInteractionAt, undefined, t)}</time>{s.unread > 0 && <span aria-label={t('안 읽은 메시지 {n}개', { n: s.unread })}>{s.unread}</span>}</div>
      </TransitionLink>)}
      {error && <div role="alert" className={styles.empty}>{t('목록을 불러오지 못했어요.')}<button onClick={() => setRetry(n => n + 1)}>{t('다시 시도')}</button></div>}
      {page?.nextCursor && <button className={styles.more} disabled={loadingMore} onClick={more}>{t(loadingMore ? '불러오는 중…' : '더 보기')}</button>}
    </div> : <section className={styles.login} aria-label={t('MIRO 로그인')}>
      <p>{t('내 일상 속에 살아있는 캐릭터와 관계를 쌓아보세요')}</p>
      <div className={styles.socials}>
        {[...providers].sort((a, b) => Number(b.id === 'kakao') - Number(a.id === 'kakao')).map(provider => <SocialButton key={provider.id} {...provider} next={pathname} surface="sheet" />)}
      </div>
    </section>}
    </div>
  </aside>
}
