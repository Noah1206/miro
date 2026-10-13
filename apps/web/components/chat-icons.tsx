import type { SVGProps } from 'react'

type Props = SVGProps<SVGSVGElement>
function Frame({ children, ...props }: Props) {
  return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden focusable="false" {...props}>{children}</svg>
}

/** A small conversation window with a soft, integrated tail. */
export function ChatRoomIcon(props: Props) {
  return <Frame {...props}>
    <path d="M8 3.75h8c3.1 0 4.75 1.7 4.75 4.75v5.25c0 3.05-1.65 4.75-4.75 4.75h-5.5L5 21v-3.1c-1.2-.75-1.75-2.1-1.75-4.15V8.5C3.25 5.45 4.9 3.75 8 3.75Z" />
    <circle cx="8" cy="11" r=".85" fill="currentColor" stroke="none" />
    <circle cx="12" cy="11" r=".85" fill="currentColor" stroke="none" />
    <circle cx="16" cy="11" r=".85" fill="currentColor" stroke="none" />
  </Frame>
}

/** A character silhouette and a small scene spark distinguish roleplay from messages. */
export function CharacterChatIcon(props: Props) {
  return <Frame {...props}>
    <circle cx="8.75" cy="8" r="3.25" />
    <path d="M3.5 20v-1.25a5.25 5.25 0 0 1 10.5 0V20" />
    <path d="m18.25 3.5 1 3.25 3.25 1-3.25 1-1 3.25-1-3.25-3.25-1 3.25-1 1-3.25Z" />
    <path d="M18.25 15v4M16.25 17h4" />
  </Frame>
}

/** A compact artist's palette, with one open thumb well. */
export function ChatPaletteIcon(props: Props) {
  return <Frame {...props}>
    <path d="M12 3.25c-5.25 0-8.75 3.5-8.75 8.5 0 4.9 3.65 9 8.5 9h1.15c1.4 0 2.15-.85 2.15-1.85 0-.7-.35-1.15-.8-1.65-.45-.5-.8-1-.8-1.65 0-1.25.9-2.1 2.25-2.1h1.55c2.35 0 3.5-1.15 3.5-3.15 0-3.85-3.8-7.1-8.75-7.1Z" />
    <circle cx="7.2" cy="10.25" r="1" fill="currentColor" stroke="none" />
    <circle cx="10.4" cy="7" r="1" fill="currentColor" stroke="none" />
    <circle cx="15" cy="7.4" r="1" fill="currentColor" stroke="none" />
    <circle cx="17.5" cy="10.25" r="1" fill="currentColor" stroke="none" />
  </Frame>
}

/** Four linked loops identify the everyday Miro conversation model. */
export function MiroModelIcon(props: Props) {
  return <Frame {...props}>
    <path d="M12 12C8.8 12 4 10.9 4 7a3 3 0 0 1 3-3c3.9 0 5 4.8 5 8Z" />
    <path d="M12 12c0-3.2 1.1-8 5-8a3 3 0 0 1 3 3c0 3.9-4.8 5-8 5Z" />
    <path d="M12 12c3.2 0 8 1.1 8 5a3 3 0 0 1-3 3c-3.9 0-5-4.8-5-8Z" />
    <path d="M12 12c0 3.2-1.1 8-5 8a3 3 0 0 1-3-3c0-3.9 4.8-5 8-5Z" />
  </Frame>
}

/** Two nested conversation contours distinguish the longer Echo model. */
export function EchoModelIcon(props: Props) {
  return <Frame {...props}>
    <path d="m12 3 7.8 4.5v9L12 21l-7.8-4.5v-9L12 3Z" />
    <path d="m12 7 4.3 2.5v5L12 17l-4.3-2.5v-5L12 7Z" />
  </Frame>
}
