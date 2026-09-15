import { redirect } from 'next/navigation'
import { currentAdmin } from '@/lib/auth'
import { aiStats } from '@/lib/ai'
export default async function AIPage() {
  if (!await currentAdmin()) redirect('/login')
  const stats = await aiStats()
  return <><h1>AI 운영</h1><p>최근 24시간 · 비용 미확인 요청은 0원으로 계산하지 않습니다.</p>
    <table><thead><tr><th>작업</th><th>모델</th><th>호출 / 성공</th><th>평균 지연</th><th>추정 비용 (USD)</th><th>미확인</th></tr></thead>
      <tbody>{stats.summary.map((r,i) => <tr key={i}><td>{String(r.task)}</td><td>{String(r.model_id ?? r.provider)}</td><td>{String(r.attempts)} / {String(r.succeeded)}</td><td>{String(r.mean_latency_ms)} ms</td><td>{String(r.estimated_cost ?? '미확인')}</td><td>{String(r.unknown_cost_attempts)}</td></tr>)}</tbody></table>
    <h2>최근 요청</h2><pre style={{ overflow: 'auto', fontSize: 12 }}>{JSON.stringify(stats.recent, null, 2)}</pre>
  </>
}
