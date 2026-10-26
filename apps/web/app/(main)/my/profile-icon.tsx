import type { ReactNode } from 'react'

export type ProfileIconName = 'settings' | 'chat' | 'characters' | 'persona' | 'globe' | 'shield' | 'bell' | 'download' | 'help' | 'data' | 'chevron'

const paths: Record<ProfileIconName, ReactNode> = {
  settings: <><path d="m9.5 3-.7 2.3-2 .9-2.2-.6-2 3.4 1.6 1.7v2.6l-1.6 1.7 2 3.4 2.2-.6 2 .9.7 2.3h4.9l.7-2.3 2-.9 2.2.6 2-3.4-1.6-1.7v-2.6l1.6-1.7-2-3.4-2.2.6-2-.9-.7-2.3z" /><circle cx="12" cy="12" r="3" /></>,
  chat: <><path d="M20.5 11.5a8.5 8.5 0 0 1-8.5 8.5c-1.3 0-2.6-.3-3.7-.9L3.5 21l1.4-4.6A8.5 8.5 0 1 1 20.5 11.5Z" /><path d="M8 11.5h.01M12 11.5h.01M16 11.5h.01" /></>,
  characters: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>,
  persona: <><circle cx="12" cy="7.5" r="3.5" /><path d="M5 21v-2a7 7 0 0 1 14 0v2M9 20h6" /></>,
  globe: <><circle cx="12" cy="12" r="9" /><ellipse cx="12" cy="12" rx="4" ry="9" /><path d="M3 12h18" /></>,
  shield: <><path d="m12 3 8 3v6c0 4.5-4.4 7.7-8 9-3.6-1.3-8-4.5-8-9V6z" /><path d="m8.5 12 2.3 2.3 4.7-4.6" /></>,
  bell: <><path d="M6 9a6 6 0 0 1 12 0c0 7 3 7 3 8H3c0-1 3-1 3-8ZM10 21h4" /></>,
  download: <><path d="M12 3v12m-4-4 4 4 4-4M4 16v4h16v-4" /></>,
  help: <><path d="M4 13v-2a8 8 0 0 1 16 0v2M20 16v2a3 3 0 0 1-3 3h-3" /><rect x="3" y="11" width="4" height="7" rx="2" /><rect x="17" y="11" width="4" height="7" rx="2" /></>,
  data: <><path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8ZM19 16v5m-2.5-2.5h5" /></>,
  chevron: <path d="m9 5 7 7-7 7" />,
}

export function ProfileIcon({ name, size = 22 }: { name: ProfileIconName; size?: number }) {
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>
}
