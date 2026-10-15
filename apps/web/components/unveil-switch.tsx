'use client'
import styles from './unveil-switch.module.css'

/** The original chat-room Unveil switch, shared with the home header. */
export function UnveilSwitch({ checked, disabled, label, accessibleLabel, describedBy, title, onChange }: {
  checked: boolean; disabled?: boolean; label: string; accessibleLabel: string
  describedBy?: string; title?: string; onChange: (next: boolean) => void
}) {
  return <span className={styles.adultControl} data-on={checked || undefined}>
    <button type="button" role="switch" aria-checked={checked} aria-label={accessibleLabel} aria-describedby={describedBy}
      disabled={disabled} title={title} className={styles.adultToggle} onClick={() => onChange(!checked)}>
      <span className={styles.adultPill}>
        <span className={styles.adultLabel}>{label}</span>
        <span aria-hidden className={styles.adultTrack}><span className={styles.adultKnob} /></span>
      </span>
    </button>
  </span>
}
