'use client'
import { useMemo, useState, useTransition } from 'react'
import type { Creator } from '@/lib/creators'
import type { HomeCard } from '@/lib/home'
import { LogoMark } from '@/components/ui'
import { CharacterCard } from '@/components/character-card'
import { FollowButton } from '@/components/creator-follow'
import { CheerButton } from '@/app/(main)/character/[slug]/cheer'
import { saveCreatorBio } from '../actions'
import { useT } from '@/lib/i18n/client'
import cards from '../../home/home.module.css'
import styles from './creator.module.css'

const BIO_MAX = 300
const compact = (n: number) => n >= 10_000 ? `${Math.floor(n / 1000) / 10}만` : n.toLocaleString('en-US')
/** 소개글의 주소는 눌러서 연다(새 탭). 나머지는 글 그대로. */
function Linked({ text }: { text: string }) {
  return <>{text.split(/(https?:\/\/[^\s]+)/g).map((part, i) => i % 2 ? <a key={i} href={part} target="_blank" rel="noopener noreferrer nofollow">{part}</a> : part)}</>
}

/** 11/20 크리에이터 프로필 — 사진·이름·배지 / 팔로워·팔로잉 / 소개 / 팔로우·응원 / 제작 캐릭터(수·대화량·정렬). */
export function CreatorProfile({ creator, works, signedIn, cheerId }: { creator: Creator; works: HomeCard[]; signedIn: boolean; cheerId: string | null }) {
  const t = useT()
  const [followers, setFollowers] = useState(creator.followers)
  const [bio, setBio] = useState(creator.bio)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(creator.bio)
  const [saving, startSave] = useTransition()
  const [sort, setSort] = useState<'chats' | 'new'>('chats')
  const total = works.reduce((n, c) => n + (c.chats ?? 0), 0)
  const sorted = useMemo(() => [...works].sort((a, b) => sort === 'chats' ? (b.chats ?? 0) - (a.chats ?? 0) : (b.createdAt ?? '').localeCompare(a.createdAt ?? '')), [works, sort])
  return <>
    <section className={styles.head}>
      <div className={styles.identity}>
        <span className={styles.avatar} aria-hidden>
          {creator.pen ? <LogoMark size={36} label="" />
            // eslint-disable-next-line @next/next/no-img-element -- 프로필 사진
            : creator.avatarUrl ? <img src={creator.avatarUrl} alt="" width={76} height={76} />
            : <span>{creator.name.slice(0, 1)}</span>}
        </span>
        <div className={styles.who}>
          <h1>{creator.name}</h1>
          {creator.pen && <span className={styles.badge}><LogoMark size={14} label="" />{t('공식 크리에이터')}</span>}
        </div>
      </div>
      <p className={styles.stats}><span>{t('팔로워')} <b>{followers.toLocaleString('en-US')}</b></span>{!creator.pen && <span>{t('팔로잉')} <b>{creator.followingCount.toLocaleString('en-US')}</b></span>}</p>
      {editing
        ? <form className={styles.bioForm} onSubmit={e => { e.preventDefault(); startSave(async () => { const saved = await saveCreatorBio(draft).catch(() => null); if (saved !== null) { setBio(saved); setDraft(saved); setEditing(false) } }) }}>
            <textarea id="creator-bio" value={draft} maxLength={BIO_MAX} rows={4} autoFocus onChange={e => setDraft(e.target.value)} aria-label={t('소개')} placeholder={t('예) 문의: 오픈채팅 주소\n안녕하세요, 이런 캐릭터를 만들어요.')} />
            <div className={styles.bioActions}><span>{draft.length}/{BIO_MAX}</span><button type="button" onClick={() => { setDraft(bio); setEditing(false) }}>{t('취소')}</button><button type="submit" disabled={saving}>{t('저장')}</button></div>
          </form>
        : bio ? <p className={styles.bio}><Linked text={bio} /></p> : null}
      <div className={styles.actions}>
        {creator.self
          ? !editing && <button type="button" className={styles.editBio} onClick={() => setEditing(true)}>{t(bio ? '소개 고치기' : '소개 쓰기')}</button>
          : <>
              <div className={styles.grow}><FollowButton big creatorKey={creator.key} following={creator.following} followers={creator.followers} signedIn={signedIn} onCount={setFollowers} /></div>
              {cheerId && <div className={styles.cheer}><CheerButton big characterId={cheerId} creatorName={creator.name} /></div>}
            </>}
      </div>
    </section>
    <div className={styles.tabs}><span aria-current="page">{t('제작 캐릭터')}</span></div>
    <div className={styles.summary}>
      <p>{t('{n}개의 캐릭터', { n: works.length })}{total > 0 && <><i aria-hidden /> {t('대화량 {n}', { n: compact(total) })}</>}</p>
      {works.length > 1 && <select value={sort} onChange={e => setSort(e.target.value as 'chats' | 'new')} aria-label={t('정렬')}>
        <option value="chats">{t('대화량순')}</option><option value="new">{t('최신순')}</option>
      </select>}
    </div>
    {works.length
      ? <div className={cards.grid} style={{ padding: '0 var(--gutter)' }}>{sorted.map(c => <CharacterCard key={c.id} c={c} />)}</div>
      : <p className={styles.empty}>{t('아직 공개한 작품이 없어요.')}</p>}
  </>
}
