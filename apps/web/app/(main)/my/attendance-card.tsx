'use client'
import { useState, useTransition } from 'react'
import { ATTENDANCE_GRANT } from '@miro/config'
import { Button } from '@/components/ui'
import { useWallet } from '@/components/wallet/provider'
import type { Attendance } from '@/lib/attendance'
import { INTL_LOCALE } from '@/lib/i18n'
import { useLanguage, useT } from '@/lib/i18n/client'
import { attend } from './actions'
import styles from './my.module.css'

/** 11/10 출석 체크 — 누르면 오늘 500토큰(7일 유효, 11/16), 7일 연속마다 500 추가(11/14 1,500→500). 점 7개가 이번 주 연속 출석. */
export function AttendanceCard({ initial }: { initial: Attendance }) {
  const t = useT()
  const locale = INTL_LOCALE[useLanguage()]
  const { wallet, sync, refreshBalance } = useWallet()
  const [state, setState] = useState(initial)
  const [notice, setNotice] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const week = ATTENDANCE_GRANT.streakDays
  // 오늘 7일째를 채웠으면 점 7개가 다 찬 채로, 아니면 이번 주기에서 채운 만큼.
  const filled = state.streak > 0 && state.streak % week === 0 && state.checkedToday ? week : state.streak % week
  // 11/19 사용자: 누르자마자 토큰이 차게 — 서버 답을 기다리지 않고 점·잔액을 먼저 올리고(프로필 잔액은 세어 올라감), 답이 오면 실제 값으로 맞춘다.
  const check = () => {
    const prev = state, before = wallet, streak = state.streak + 1
    setState({ checkedToday: true, streak })
    if (wallet) sync({ ...wallet, available: wallet.available + ATTENDANCE_GRANT.daily + (streak % week === 0 ? ATTENDANCE_GRANT.weeklyBonus : 0) })
    start(async () => {
      setNotice(null)
      try {
        const r = await attend()
        setState({ checkedToday: r.checkedToday, streak: r.streak })
        if (r.granted > 0) setNotice(r.bonus ? t('{days}일 연속 출석! {amount}토큰을 받았어요', { days: r.streak, amount: r.granted.toLocaleString(locale) })
          : t('{amount}토큰을 받았어요 · 7일 동안 쓸 수 있어요', { amount: r.granted.toLocaleString(locale) }))
        void refreshBalance(true)
      } catch {
        setState(prev); if (before) sync(before)
        setNotice(t('출석하지 못했어요. 다시 시도해 주세요.'))
      }
    })
  }
  return (
    <section className={styles.credit} aria-label={t('출석 체크')} style={{ marginTop: 12 }}>
      <div className={styles.creditHeader}>
        <h2>{t('출석 체크')}</h2>
        <span style={{ color: 'var(--profile-muted)', fontSize: 12 }}>{t('{days}일 연속', { days: state.streak })}</span>
      </div>
      {/* 11/12 사용자: 출석하기 버튼은 일주일 점 줄 밑에 가로 전체로 */}
      <div className={styles.creditMain} style={{ marginBottom: 10, flexDirection: 'column', alignItems: 'stretch' }}>
        <ol aria-label={t('이번 주 출석 {n}/{week}일', { n: filled, week })} style={{ display: 'flex', gap: 6, margin: 0, padding: 0, listStyle: 'none' }}>
          {Array.from({ length: week }, (_, i) => <li key={i} aria-hidden style={{ width: 22, height: 22, borderRadius: '50%', display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 650,
            background: i < filled ? 'var(--color-accent)' : 'var(--profile-control)', color: i < filled ? 'var(--color-white, #fff)' : 'var(--profile-muted)' }}>{i + 1}</li>)}
        </ol>
        <Button type="button" variant="primary" size="sm" className={styles.chargeButton} style={{ borderRadius: 8, fontSize: 15, width: '100%', background: '#fff', color: '#111015', borderColor: '#fff' }}
          onClick={check} disabled={state.checkedToday || pending}>{state.checkedToday ? t('출석 완료') : t('출석하기')}</Button>
      </div>
      <p style={{ margin: 0, color: 'var(--profile-muted)', fontSize: 12, lineHeight: 1.5 }} role="status">
        {notice ?? t('매일 {daily}토큰 · {week}일 연속이면 {bonus}토큰 더', { daily: ATTENDANCE_GRANT.daily.toLocaleString(locale), week, bonus: ATTENDANCE_GRANT.weeklyBonus.toLocaleString(locale) })}
      </p>
    </section>
  )
}
