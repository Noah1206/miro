'use client'
import { Button, useToast } from '@/components/ui'
import styles from '@/components/wallet/wallet.module.css'

/** 시트의 행동 버튼은 배경에 녹는 어두운 채움 — 주황은 지갑 화면의 충전하기 하나만 쓴다. */
export const SHEET_BUTTON = { background: 'var(--color-surface-3)', border: '1px solid var(--color-border-strong)' } as const

/**
 * 입금을 돕는 두 버튼. 같은 크기, 같은 위상.
 *
 * **토스**는 송금 딥링크를 공개해서 은행·계좌번호·금액이 채워진 송금창이 바로 열린다.
 * **카카오뱅크**는 송금 딥링크를 공개하지 않아 앱만 연다 — 누르는 순간 계좌번호를 클립보드에 실어 둔다.
 * 어느 쪽을 눌렀는지 부모에게 알려 '입금 확인하기' 를 연다.
 */
export function TransferActions({ bank, accountNumber, amount, onOpen }: {
  bank: string; accountNumber: string; amount: number; onOpen?: () => void
}) {
  const toast = useToast()
  // 딥링크에는 숫자만 넣는다.
  const digits = accountNumber.replace(/-/g, '')

  /** 앱이 없으면 scheme 이동이 조용히 실패한다. 잠시 뒤에도 페이지가 살아 있으면 웹으로 보낸다. */
  function open(url: string, web: string) {
    const started = Date.now()
    location.href = url
    setTimeout(() => {
      if (document.hidden || Date.now() - started > 2500) return
      window.open(web, '_blank', 'noopener')
    }, 1200)
  }

  function openToss() {
    onOpen?.()
    open(`supertoss://send?bank=${encodeURIComponent(bank)}&accountNo=${digits}&amount=${amount}`, 'https://toss.im/')
  }

  async function openKakaoBank() {
    onOpen?.()
    try { await navigator.clipboard.writeText(digits); toast('계좌번호를 복사했어요. 앱에서 붙여 넣어 주세요.') }
    catch { toast('계좌번호를 복사하지 못했어요. ? 를 눌러 계좌번호를 확인해 주세요.') }
    open('kakaobank://', 'https://www.kakaobank.com/')
  }

  return (
    <div className={styles.banks}>
      <Button type="button" variant="secondary" size="lg" full style={SHEET_BUTTON} data-open-bank="toss" onClick={openToss}>
        <TossMark />토스로 송금하기
      </Button>
      <Button type="button" variant="secondary" size="lg" full style={SHEET_BUTTON} data-open-bank="kakaobank" onClick={() => void openKakaoBank()}>
        <KakaoBankMark />카카오뱅크로 송금하기
      </Button>
    </div>
  )
}

/* 브랜드 색의 단순 표식 — 공식 로고 자산이 아니다. 색은 두 브랜드가 정한 값이라 토큰으로 두지 않는다. */
function TossMark() {
  return <svg aria-hidden width="20" height="20" viewBox="0 0 20 20"><rect width="20" height="20" rx="5" fill="#0064FF" /><path d="M6 6.5h8M10 6.5V14" stroke="#FFFFFF" strokeWidth="2.2" strokeLinecap="round" /></svg>
}
function KakaoBankMark() {
  return <svg aria-hidden width="20" height="20" viewBox="0 0 20 20"><rect width="20" height="20" rx="5" fill="#FFE300" /><path d="M6.5 5.5v9M6.5 10l6-4.5M6.5 10l6.5 4.5" stroke="#1E1E1E" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
}
