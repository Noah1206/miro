'use client'
import styles from './unveil-switch.module.css'

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
          // 11/6 사용자: 홈 머리는 '언베일' 글자 대신 19 아이콘. 꺼져 있으면 회색, 켜지면 그라데이션.
          ? <svg aria-hidden className={styles.unveilMark} viewBox="0 0 40 40">
              {/* 11/6: 청소년유해표시 공식 규격(컬러) — 빨간 테두리 원, 흰 바탕, 검은 19. 꺼져 있으면 테두리만 회색. */}
              <circle cx="20" cy="20" r="17.5" fill="#fff" strokeWidth="4" className={styles.unveil19Ring} />
              <text x="20" y="26.5" textAnchor="middle" fontSize="18" fontWeight="900" fill="#000" style={{ fontFamily: 'Pretendard, system-ui, sans-serif', letterSpacing: '-0.5px' }}>19</text>
            </svg>
          : <span className={styles.adultLabel}>{label}</span>}
        <span aria-hidden className={styles.adultTrack}><span className={styles.adultKnob} /></span>
      </span>
    </button>
  </span>
}
