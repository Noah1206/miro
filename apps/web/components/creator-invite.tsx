'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button, Sheet } from '@/components/ui'
import { useT } from '@/lib/i18n/client'
import styles from './push-subscribe.module.css'

const SEEN_KEY = 'miro:creator-invite-seen'

/**
 * 11/13 사용자: 처음 온 사람에게 제작자 모집을 한 번 알린다(이 브라우저에서 한 번만). 홈에서만 뜬다 — 작품 상세로 바로 온 사람의 '대화 시작'을 가로막지 않는다.
 * 다른 시트(방문자 동의·로그인·알림·가입 선물)가 떠 있으면 그게 닫힐 때까지 기다린다 — 겹쳐 띄우지 않는다.
 * 비율은 서버가 실제 상수(CREATOR_REWARD_RATE)에서 넘긴다 — 문구와 지급이 어긋나지 않게.
 */
export function CreatorInvite({ ratePercent }: { ratePercent: number }) {
  const t = useT()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  useEffect(() => {
    try { if (localStorage.getItem(SEEN_KEY)) return } catch { return }   // 저장소를 못 쓰면 매번 뜨게 되니 아예 띄우지 않는다
    const q = new URLSearchParams(location.search)
    if (q.has('welcome') || q.has('login')) return   // 가입 직후·로그인 시트가 먼저
    let tries = 0
    const timer = setInterval(() => {
      if (++tries > 90) return clearInterval(timer)
      if (document.querySelector('[role="dialog"], dialog[open]')) return   // 다른 시트가 닫힐 때까지
      clearInterval(timer)
      try { localStorage.setItem(SEEN_KEY, '1') } catch {}
      setOpen(true)
    }, 1500)
    return () => clearInterval(timer)
  }, [])
  const close = () => setOpen(false)
  return (
    <Sheet open={open} onClose={close} label={t('초기 제작자를 찾고 있어요')} compact>
      <div className={styles.stack}>
        <div className={styles.center}>
          <img className={styles.icon} src="/miro-coin.png" alt="" aria-hidden width={64} height={64} decoding="async" />
          <h2 className="t-title-2" tabIndex={-1} data-initial-focus>{t('초기 제작자를 찾고 있어요')}</h2>
          <p>{t('독점·등급 조건 없이 첫 작품부터 대화 보상 {rate}%, 수익은 계좌로 받아요.', { rate: ratePercent })}</p>
        </div>
        <div className={styles.actions}>
          <Button variant="primary" full className="btn-start" pressScale={0.94} onClick={() => { close(); router.push('/creators') }}
            style={{ background: 'var(--color-lavender-600)', border: '1px solid var(--color-lavender-600)', color: 'var(--color-white)', fontWeight: 'var(--weight-regular)', borderRadius: 'var(--radius-lg)' }}>{t('제작자 안내 보기')}</Button>
          <Button variant="ghost" size="sm" full onClick={close} style={{ color: 'var(--color-text-primary)' }}>{t('나중에')}</Button>
        </div>
      </div>
    </Sheet>
  )
}
