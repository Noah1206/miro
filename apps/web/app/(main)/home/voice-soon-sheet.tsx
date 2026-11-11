'use client'
import { useEffect, useState } from 'react'
import { Sheet } from '@/components/ui/sheet'
import { Button } from '@/components/ui'
import { useT } from '@/lib/i18n/client'
import styles from './voice-soon-sheet.module.css'

const SEEN = 'miro:voice-soon:v1'

/**
 * 음성 모드 예고(11/12 사용자: 음성은 가려 두고 팝업으로 알린다) — 음성 서버가 멈춘 동안(MIRO_VOICE_PAUSED=1) 홈에서 이 기기에 한 번만 뜬다.
 * 다른 팝업(가입 선물·취향 고르기 등)이 떠 있으면 이번엔 건너뛰고 다음 방문 때 뜬다. 날짜는 약속하지 않는다.
 */
export function VoiceSoonSheet() {
  const t = useT()
  const [open, setOpen] = useState(false)
  useEffect(() => {
    try { if (localStorage.getItem(SEEN)) return } catch { return }
    const timer = setTimeout(() => {
      if (document.querySelector('dialog[open], [role="dialog"], [aria-modal="true"]')) return
      setOpen(true)
    }, 1200)
    return () => clearTimeout(timer)
  }, [])
  const close = () => { try { localStorage.setItem(SEEN, '1') } catch { /* 이번 화면에서만 */ } setOpen(false) }
  // 11/12 다른 시트(알림·지갑)와 같은 틀로: 가운데 아이콘 → 제목 → 설명 → 전폭 버튼. 첫 초점은 제목(닫기 버튼이면 열리자마자 흰 링이 보인다).
  return <Sheet open={open} onClose={close} label={t('음성 모드가 곧 열려요')} compact>
    <div style={{ display: 'grid', gap: 'var(--space-5)' }}>
      <div className={styles.center}>
        {/* 힉스필드 점토 마이크(알림 종과 같은 질감) + 소리 물결. 열릴 때마다 처음부터 움직이도록 open 일 때만 그린다. */}
        {open && <span className={styles.stage} aria-hidden>
          <i className={styles.ring} /><i className={styles.ring} />
          <img className={styles.icon} src="/voice-mic.png" alt="" width={64} height={64} decoding="async" />
        </span>}
        <h2 className={`t-title-2 ${styles.title}`} tabIndex={-1} data-initial-focus>{t('음성 모드가 곧 열려요')}</h2>
        <p className={styles.line}>{t('캐릭터가 목소리로 답하는 음성 모드를 준비하고 있어요. 열리면 채팅방 메뉴에서 켤 수 있어요.')}</p>
      </div>
      <Button variant="primary" full onClick={close}>{t('확인')}</Button>
    </div>
  </Sheet>
}
