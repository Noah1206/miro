/** A character's saved proactive-contact setting, not live online status. */
export function ContactBadge({ enabled }: { enabled?: boolean | null }) {
  if (!enabled) return null
  return <span aria-label="먼저 오는 연락 활성화" title="상황과 관계에 따라 먼저 연락하는 캐릭터" style={{
    position: 'absolute', top: 9, right: 9, zIndex: 1,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    width: 24, height: 22, color: '#F15B62',
  }}>
    <svg aria-hidden width="24" height="19.2" viewBox="0 0 24 24" preserveAspectRatio="none" fill="currentColor" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
      <path d="M13 2 4 14h7l-1 8 10-13h-7l0-7Z" />
    </svg>
  </span>
}
