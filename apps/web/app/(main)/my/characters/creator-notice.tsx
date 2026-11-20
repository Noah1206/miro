'use client'
import { useEffect, useState } from 'react'
import { useT } from '@/lib/i18n/client'
import styles from './characters.module.css'

const KEY = 'miro:creator-notice-dismissed:v1'

/** 11/16 만드는 사람에게 하는 약속. 11/20 사용자: × 로 닫으면 다시 안 보인다(이 기기 기준). 닫았는지 알기 전엔 그리지 않는다 — 닫은 사람에게 깜빡이지 않게. */
export function CreatorNotice() {
  const t = useT()
  const [show, setShow] = useState(false)
  useEffect(() => { try { setShow(localStorage.getItem(KEY) !== '1') } catch { setShow(true) } }, [])
  if (!show) return null
  return <div className={styles.notice}>
    <p>{t('미로는 독점을 요구하지 않아요. 비공개 캐릭터의 설정은 운영이 고치거나 지우지 않아요. 공개 작품에 조치가 필요하면 이유를 알려 드려요.')}</p>
    <button type="button" aria-label={t('닫기')} onClick={() => { setShow(false); try { localStorage.setItem(KEY, '1') } catch { /* 이번 화면에서만 닫힌다 */ } }}>
      <svg aria-hidden width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg>
    </button>
  </div>
}
