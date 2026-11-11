'use client'
import { useEffect, useState } from 'react'
import { Sheet } from '@/components/ui/sheet'
import { Button } from '@/components/ui'
import { useT } from '@/lib/i18n/client'

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
  return <Sheet open={open} onClose={close} title={t('음성 모드가 곧 열려요')} variant="choice" snap={{ half: 0.36, full: 0.5 }}>
    <div className="stack" style={{ gap: 16, padding: '0 var(--space-4) var(--space-5)' }}>
      <p style={{ margin: 0, color: 'var(--color-text-secondary)', fontSize: 15, lineHeight: 1.6 }}>{t('캐릭터가 목소리로 답하는 음성 모드를 준비하고 있어요. 열리면 채팅방 메뉴에서 켤 수 있어요.')}</p>
      <Button onClick={close}>{t('확인')}</Button>
    </div>
  </Sheet>
}
