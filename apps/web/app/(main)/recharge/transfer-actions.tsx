'use client'
import { useState } from 'react'
import { Button, useToast } from '@/components/ui'

/**
 * 입금을 돕는 버튼들.
 *
 * 토스·카카오뱅크는 **계좌와 금액을 미리 채운 송금 화면을 여는 공개 딥링크를 제공하지
 * 않는다.** 그건 제휴 가맹점용 결제 API 의 영역이고 우리는 PG 없이 계좌이체를 받는다.
 * 그래서 할 수 있는 최선은 "복사해 두고 앱을 여는 것" 이다 — 사용자는 붙여넣기만 한다.
 * 버튼 문구도 그렇게 적는다. 자동으로 채워질 것처럼 쓰면 사용자가 앱에서 헤맨다.
 */
const APPS = [
  { id: 'toss', label: '토스', scheme: 'supertoss://', web: 'https://toss.im/' },
  { id: 'kakaobank', label: '카카오뱅크', scheme: 'kakaobank://', web: 'https://www.kakaobank.com/' },
] as const

export function TransferActions({ accountNumber, amount, depositName }: {
  accountNumber: string; amount: number; depositName: string
}) {
  const toast = useToast()
  const [copied, setCopied] = useState<string | null>(null)

  async function copy(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(label); toast(`${label} 복사했어요`)
      setTimeout(() => setCopied(null), 2000)
    } catch {
      // 클립보드는 권한·컨텍스트에 따라 막힌다. 실패를 성공처럼 보여주지 않는다.
      toast('복사하지 못했어요. 길게 눌러 복사해 주세요.')
    }
  }

  /**
   * 앱을 연다. 설치돼 있지 않으면 scheme 이동이 조용히 실패하므로, 잠시 뒤에도
   * 페이지가 살아 있으면 웹으로 보낸다. 이미 앱으로 넘어갔다면 문서가 숨겨져 있어
   * 웹으로 튀지 않는다.
   */
  function open(scheme: string, web: string) {
    const started = Date.now()
    location.href = scheme
    setTimeout(() => {
      if (document.hidden || Date.now() - started > 2500) return
      window.open(web, '_blank', 'noopener')
    }, 1200)
  }

  return (
    <div className="stack" style={{ marginTop: 14, gap: 10 }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <Button type="button" variant="primary" size="sm" full data-copy-account
          onClick={() => copy(accountNumber, '계좌번호')}>
          {copied === '계좌번호' ? '복사됨' : '계좌번호 복사'}
        </Button>
        <Button type="button" variant="secondary" size="sm" full data-copy-name
          onClick={() => copy(depositName, '입금자명')}>
          {copied === '입금자명' ? '복사됨' : '입금자명 복사'}
        </Button>
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        {APPS.map(a => (
          <Button key={a.id} type="button" variant="secondary" size="sm" full data-open-bank={a.id}
            onClick={async () => { await copy(accountNumber, '계좌번호'); open(a.scheme, a.web) }}>
            {a.label} 열기
          </Button>
        ))}
      </div>

      {/* 자동으로 채워지지 않는다는 사실을 버튼 옆에 둔다. */}
      <p className="t-caption" style={{ color: 'var(--color-text-tertiary)' }}>
        계좌번호를 복사한 뒤 앱을 열어요. 금액({amount.toLocaleString('ko-KR')}원)과 입금자명은
        앱에서 직접 넣어야 해요 — 은행 앱이 미리 채워진 송금 화면을 열어 주지는 않아요.
      </p>
    </div>
  )
}
