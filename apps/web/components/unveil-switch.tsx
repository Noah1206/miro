'use client'
import { Black_Han_Sans } from 'next/font/google'
import styles from './unveil-switch.module.css'

/** 홈 언베일 글자 마크(10/20 시안 2 '걷히는 베일')에만 쓰는 굵은 글꼴. */
const markFont = Black_Han_Sans({ weight: '400', subsets: ['latin'], display: 'swap', preload: false })

/** The original chat-room Unveil switch, shared with the home header. */
export function UnveilSwitch({ checked, disabled, label, accessibleLabel, describedBy, title, onChange, intense = false }: {
  checked: boolean; disabled?: boolean; label: string; accessibleLabel: string
  describedBy?: string; title?: string; onChange: (next: boolean) => void
  /** 홈 머리의 강한 모양(10/20) — 대화방 스위치는 그대로. */
  intense?: boolean
}) {
  return <span className={styles.adultControl} data-on={checked || undefined} data-intense={intense || undefined}>
    <button type="button" role="switch" aria-checked={checked} aria-label={accessibleLabel} aria-describedby={describedBy}
      disabled={disabled} title={title} className={styles.adultToggle} onClick={() => onChange(!checked)}>
      <span className={styles.adultPill}>
        {intense
          // 걷히는 베일: 꺼져 있으면 글자 왼쪽이 사선 베일에 가려 회색, 켜지면 베일이 걷히고 그라데이션 글자.
          ? <svg aria-hidden className={`${styles.unveilMark} ${markFont.className}`} viewBox="0 0 120 40">
              <defs><linearGradient id="unveil-mark-g" x1="0" x2="1"><stop offset="0" stopColor="#ff3d7f" /><stop offset="1" stopColor="#ff9a3d" /></linearGradient></defs>
              <text x="60" y="31" textAnchor="middle" fontSize="30" className={styles.unveilText}>{label}</text>
              <g className={styles.unveilVeil}><polygon points="0,0 72,0 52,40 0,40" /><line x1="72" y1="0" x2="52" y2="40" /></g>
            </svg>
          : <span className={styles.adultLabel}>{label}</span>}
        <span aria-hidden className={styles.adultTrack}><span className={styles.adultKnob} /></span>
      </span>
    </button>
  </span>
}
