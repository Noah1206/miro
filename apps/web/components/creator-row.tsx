'use client'
import { useState } from 'react'
import type { Creator } from '@/lib/creators'
import { LogoMark } from '@/components/ui'
import { TransitionLink } from '@/components/ui/transition-link'
import { FollowButton } from '@/components/creator-follow'
import { useT } from '@/lib/i18n/client'

/** 11/12 작품 상세 맨 위(사진 밖) — 만든 사람(운영 작품은 필명) 사진·이름(누르면 크리에이터 페이지)과 팔로우. */
export function CreatorRow({ creator, signedIn }: { creator: Creator; signedIn: boolean }) {
  const t = useT()
  const [followers, setFollowers] = useState(creator.followers)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 48 }}>
      <TransitionLink href={`/creator/${encodeURIComponent(creator.key)}`} style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1, color: 'var(--color-text-primary)' }}>
        <span aria-hidden style={{ flex: 'none', width: 32, height: 32, borderRadius: '50%', overflow: 'hidden', display: 'grid', placeItems: 'center', background: 'var(--color-surface-3)' }}>
          {creator.pen ? <LogoMark size={18} label="" />
            // eslint-disable-next-line @next/next/no-img-element -- 작은 프로필 사진
            : creator.avatarUrl ? <img src={creator.avatarUrl} alt="" width={32} height={32} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : <span style={{ fontSize: 13, fontWeight: 700 }}>{creator.name.slice(0, 1)}</span>}
        </span>
        <span style={{ minWidth: 0 }}>
          <strong style={{ display: 'block', fontSize: 15, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{creator.name}</strong>
          <span className="t-caption" style={{ color: 'var(--color-text-tertiary)' }}>{t('팔로워 {n}', { n: followers.toLocaleString('en-US') })}</span>
        </span>
      </TransitionLink>
      {!creator.self && <FollowButton creatorKey={creator.key} following={creator.following} followers={creator.followers} signedIn={signedIn} onCount={setFollowers} />}
    </div>
  )
}
