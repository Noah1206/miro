import Link from 'next/link'
import { redirect } from 'next/navigation'
import { currentAdmin } from '@/lib/auth'
import { funnel } from '@/lib/funnel'

const STEPS = [
  ['visit', '홈 방문'], ['signup', '가입 완료'], ['started', '대화 시작'], ['turn5', '5턴 도달'], ['verified', '성인 인증'],
  ['unveil', '언베일 켜기'], ['photo', '사진 생성'], ['requested', '입금 신청'], ['approved', '입금 확인'],
] as const
const tone = (r: number) => (r >= 50 ? '#2f8a4e' : r >= 20 ? '#b7791f' : '#c2412d')

/** 남성향 퍼널 — 단계별 고유 사용자 수와 바로 앞 단계 대비 전환율. 운영자 계정은 집계에서 뺀다. */
export default async function FunnelPage({ searchParams }: { searchParams: Promise<{ d?: string }> }) {
  if (!await currentAdmin()) redirect('/login')
  const days = (await searchParams).d === '30' ? 30 : 7
  const { steps, works } = await funnel(days)
  const counts = STEPS.map(([k]) => steps[k] ?? 0)
  const max = Math.max(1, ...counts)
  // 가장 많이 빠지는 곳 — 앞 단계가 0 이 아닌 구간 중 전환율이 가장 낮은 곳.
  const worst = counts.map((n, i) => ({ i, rate: i && counts[i - 1] ? n / counts[i - 1]! : Infinity })).sort((a, b) => a.rate - b.rate)[0]
  return <>
    <h1>퍼널</h1>
    <p>최근 {days}일 · 남성향 · 고유 사용자 수 · <Link href="/funnel?d=7">7일</Link> / <Link href="/funnel?d=30">30일</Link></p>
    <p style={{ fontSize: 16 }}>{worst && worst.rate !== Infinity
      ? <>가장 많이 빠지는 곳: <strong>{STEPS[worst.i - 1]![1]} → {STEPS[worst.i]![1]}</strong> <span style={{ color: tone(Math.round(worst.rate * 100)) }}>({Math.round(worst.rate * 100)}%)</span></>
      : '아직 비교할 데이터가 없어요.'}</p>
    <table><thead><tr><th>단계</th><th style={{ width: '50%' }} /><th>사람</th><th>앞 단계 대비</th></tr></thead>
      <tbody>{STEPS.map(([k, label], i) => {
        const n = steps[k] ?? 0, prev = i ? steps[STEPS[i - 1]![0]] ?? 0 : null
        const rate = prev ? Math.round((n / prev) * 100) : null
        return <tr key={k}><td>{label}</td>
          <td><div style={{ height: 14, width: `${Math.max((n / max) * 100, 1)}%`, background: 'var(--accent, #e2621b)', borderRadius: 4 }} /></td>
          <td>{n.toLocaleString()}</td>
          <td style={{ color: rate === null ? undefined : tone(rate) }}>{i === 0 ? '기준' : rate === null ? '—' : `${rate}%`}</td></tr>
      })}</tbody></table>
    <h2>계좌이체</h2>
    <p>신청 후 미입금률 {steps.unpaid_pct ?? '—'}{steps.unpaid_pct != null && '%'} · 입금 확인까지 중간값 {steps.wait_min ?? '—'}{steps.wait_min != null && '분'}</p>
    <h2>작품별</h2>
    <table><thead><tr><th>작품</th><th>대화 시작</th><th>5턴 도달</th><th>시작→5턴</th><th>언베일</th><th>사진</th></tr></thead>
      <tbody>{works.map(w => {
        const r = w.started ? Math.round((w.turn5 / w.started) * 100) : null
        return <tr key={w.name}><td>{w.name}</td><td>{w.started}</td><td>{w.turn5}</td>
          <td style={{ color: r === null ? undefined : tone(r) }}>{r === null ? '—' : `${r}%`}</td><td>{w.unveil}</td><td>{w.photo}</td></tr>
      })}</tbody></table>
  </>
}
