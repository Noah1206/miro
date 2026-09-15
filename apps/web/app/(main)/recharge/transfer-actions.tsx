'use client'
import { useState } from 'react'
import { Button, useToast } from '@/components/ui'

/**
 * 입금을 돕는 버튼들. 두 은행이 서로 다른 방식이고, 그 차이를 화면에 그대로 드러낸다.
 *
 * **토스**는 송금 딥링크를 공개해서 은행·계좌번호·금액이 채워진 송금창이 바로 열린다.
 * 사용자는 확인만 누르면 된다.
 *
 * **카카오뱅크**는 송금 딥링크를 공개하지 않아 앱을 열기만 한다. 그래서 누르는 순간
 * 계좌번호를 클립보드에 실어 두고, 앱에서 붙여넣게 한다.
 */
export function TransferActions({ bank, accountNumber, amount, depositName }: {
  bank: string; accountNumber: string; amount: number; depositName: string
}) {
  const toast = useToast()
  const [copied, setCopied] = useState<string | null>(null)

  // 딥링크에는 숫자만 넣는다. 화면에는 하이픈이 있는 그대로 보여 준다.
  const digits = accountNumber.replace(/-/g, '')

  async function copy(text: string, label: string): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(label); toast(`${label} 복사했어요`)
      setTimeout(() => setCopied(null), 2000)
      return true
    } catch {
      // 클립보드는 권한·컨텍스트에 따라 막힌다. 실패를 성공처럼 보여주지 않는다.
      toast('복사하지 못했어요. 길게 눌러 복사해 주세요.')
      return false
    }
  }

  /** 앱이 없으면 scheme 이동이 조용히 실패한다. 잠시 뒤에도 페이지가 살아 있으면 웹으로 보낸다. */
  function open(url: string, web: string) {
    const started = Date.now()
    location.href = url
    setTimeout(() => {
      if (document.hidden || Date.now() - started > 2500) return
      window.open(web, '_blank', 'noopener')
    }, 1200)
  }

  /** 토스: 은행·계좌·금액이 채워진 송금창이 열린다. */
  function openToss() {
    const url = `supertoss://send?bank=${encodeURIComponent(bank)}&accountNo=${digits}&amount=${amount}`
    open(url, 'https://toss.im/')
  }

  /** 카카오뱅크: 앱만 열리므로 계좌번호를 먼저 클립보드에 넣는다. */
  async function openKakaoBank() {
    await copy(digits, '계좌번호')
    open('kakaobank://', 'https://www.kakaobank.com/')
  }

  return (
    <div className="stack" style={{ marginTop: 14, gap: 10 }}>
      <Button type="button" variant="primary" size="md" full data-open-bank="toss" onClick={openToss}>
        토스로 송금하기
      </Button>
      <p className="t-caption" style={{ color: 'var(--color-text-tertiary)', marginTop: -4 }}>
        은행·계좌번호·{amount.toLocaleString('ko-KR')}원이 채워진 송금창이 열려요. 입금자명 뒤에
        코드만 붙여 주세요.
      </p>

      <div style={{ display: 'flex', gap: 8 }}>
        <Button type="button" variant="secondary" size="sm" full data-open-bank="kakaobank" onClick={openKakaoBank}>
          카카오뱅크 열기
        </Button>
        <Button type="button" variant="secondary" size="sm" full data-copy-name
          onClick={() => copy(depositName, '입금자명')}>
          {copied === '입금자명' ? '복사됨' : '입금자명 복사'}
        </Button>
      </div>
      {/* 카카오뱅크는 금액이 채워지지 않는다 — 토스와 다르다는 것을 숨기지 않는다. */}
      <p className="t-caption" style={{ color: 'var(--color-text-tertiary)' }}>
        카카오뱅크는 계좌번호를 복사해 앱을 열어요. 금액과 입금자명은 앱에서 넣어 주세요.
      </p>
    </div>
  )
}
