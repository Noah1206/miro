import { can } from '@miro/domain'
import { currentAdmin } from '@/lib/auth'
import { lastKstMonth, monthlyWithholding } from '@/lib/payouts'

/**
 * 간이지급명세서(거주자의 사업소득) 입력용 CSV — 사람별 한 줄. 홈택스 화면에 옮겨 적거나 홈택스 엑셀 양식에 붙여 넣는다.
 * 주민등록번호가 들어 있으니 내려받은 파일은 제출 뒤 지운다.
 */
export async function GET(req: Request) {
  const admin = await currentAdmin()
  if (!admin || !can(admin.role, 'payments.act')) return new Response('forbidden', { status: 403 })
  const raw = new URL(req.url).searchParams.get('month') ?? ''
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(raw) ? raw : lastKstMonth()
  const { people } = await monthlyWithholding(month)
  const ym = month.replace('-', '')
  const cell = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`
  const lines = [['귀속연월', '지급연월', '소득자 성명', '주민등록번호', '내외국인(1=내국인)', '업종코드', '지급액', '세율(%)', '소득세', '지방소득세'],
    ...people.map(p => [ym, ym, p.realName, p.rrn, 1, '940306', p.gross, 3, p.incomeTax, p.localTax])]
  return new Response('﻿' + lines.map(l => l.map(cell).join(',')).join('\r\n'), {
    headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="simple-statement-business-${ym}.csv"`, 'cache-control': 'no-store' },
  })
}
