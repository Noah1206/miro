'use client'

import { useRouter } from 'next/navigation'
import { activeDraftKey, CREATE_CHARACTER_OPTIONS, type CreateCharacterType } from '@/lib/create-character-types'
import { Sheet } from './sheet'
import styles from './create-nav-sheet.module.css'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function CreateNavSheet({ open, onClose, userId }: { open: boolean; onClose: () => void; userId: string }) {
  const router = useRouter()
  const choose = (type: CreateCharacterType) => {
    let href = `/create?type=${type}`
    try {
      const active = localStorage.getItem(activeDraftKey(userId, type))
      if (active && UUID.test(active)) href += `&draft=${active}`
    } catch { /* Browsers can block local storage; the create page will issue a fresh draft ID. */ }
    onClose()
    router.push(href)
  }

  return <Sheet open={open} onClose={onClose} title="어떤 캐릭터를 만들까요?" variant="choice">
    <div className={styles.options} data-create-nav-sheet>
      {CREATE_CHARACTER_OPTIONS.map(({ type, title, description }) =>
        <button key={type} type="button" className={styles.option} onClick={() => choose(type)}>
          <CreateIcon type={type} />
          <span className={styles.copy}>
            <span className={styles.title}>{title}</span>
            <span className={styles.description}>{description}</span>
          </span>
        </button>,
      )}
    </div>
  </Sheet>
}

function CreateIcon({ type }: { type: CreateCharacterType }) {
  return <svg className={styles.icon} aria-hidden viewBox="0 0 24 24" fill="currentColor" fillRule="evenodd">
    {type === 'chat'
      ? <path d="M12 3C6.9 3 2.8 6.5 2.8 10.8c0 2.3 1.2 4.3 3.2 5.7L5 20.8l4.6-2.3c.8.2 1.6.3 2.4.3 5.1 0 9.2-3.5 9.2-7.8S17.1 3 12 3Z" />
      : <><path d="M10.8 2.6h7.2a3.4 3.4 0 0 1 3.4 3.4v7.2a3.4 3.4 0 0 1-3.4 3.4h-7.2a3.4 3.4 0 0 1-3.4-3.4V6a3.4 3.4 0 0 1 3.4-3.4Z" /><path d="M6 7.4h7.2a3.4 3.4 0 0 1 3.4 3.4v7.2a3.4 3.4 0 0 1-3.4 3.4H6a3.4 3.4 0 0 1-3.4-3.4v-7.2A3.4 3.4 0 0 1 6 7.4Z" /></>}
  </svg>
}
