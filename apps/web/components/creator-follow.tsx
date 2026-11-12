'use client'
import { useState, useTransition } from 'react'
import { useLoginSheet } from '@/components/ui'
import { useT } from '@/lib/i18n/client'
import { toggleFollow } from '@/app/(main)/creator/actions'

/** 11/12 팔로우 버튼 — 로그인 전이면 로그인 시트. 누르는 즉시 바뀌고, 서버 값으로 맞춘다. */
export function FollowButton({ creatorKey, following: initial, followers: initialCount, signedIn, onCount }: {
  creatorKey: string; following: boolean; followers: number; signedIn: boolean; onCount?: (n: number) => void
}) {
  const t = useT(), login = useLoginSheet()
  const [following, setFollowing] = useState(initial)
  const [, start] = useTransition()
  const press = () => {
    if (!signedIn) { login(); return }
    const next = !following
    setFollowing(next); onCount?.(initialCount + (next === initial ? 0 : next ? 1 : -1))
    start(async () => {
      const r = await toggleFollow(creatorKey, next).catch(() => null)
      if (r) { setFollowing(r.following); onCount?.(r.followers) } else { setFollowing(!next); onCount?.(initialCount) }
    })
  }
  return <button type="button" onClick={press} aria-pressed={following}
    style={{ flex: 'none', minHeight: 32, padding: '0 14px', borderRadius: 999, fontSize: 13, fontWeight: 700, cursor: 'pointer',
      border: following ? '1px solid var(--color-border-strong)' : '1px solid var(--color-white)',
      background: following ? 'transparent' : 'var(--color-white)', color: following ? 'var(--color-text-secondary)' : '#111015' }}>
    {following ? t('팔로잉') : t('팔로우')}
  </button>
}
