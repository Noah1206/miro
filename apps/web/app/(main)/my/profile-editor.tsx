'use client'
import { useActionState, useEffect, useState } from 'react'
import { PERSONA_LIMITS } from '@miro/domain'
import { LogoMark, Sheet, TransitionLink } from '@/components/ui'
import { SubmitButton } from '@/components/ui/submit-button'
import { CharacterPhoto } from '@/components/character-visual'
import { CountedInput, LabeledField } from '@/app/(main)/create/form-parts'
import { SHEET_BUTTON } from '@/app/(main)/recharge/transfer-actions'
import { useT } from '@/lib/i18n/client'
import { saveProfile } from './actions'
import styles from './my.module.css'

const MAX_BYTES = 5 * 1024 * 1024

/** '나' 화면 연필(2026-09-30 요청) — 누르면 닉네임·프로필 사진을 고치는 시트. 사진은 저장을 누를 때 올라간다. */
export function ProfileEditor({ nickname, avatarUrl }: { nickname: string; avatarUrl: string | null }) {
  const t = useT()
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" className={`hit ${styles.edit}`} aria-label={t('프로필 편집')} onClick={() => setOpen(true)}>
        <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M11 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5" /><path d="M17.6 3.6a2 2 0 0 1 2.8 2.8L12 14.8l-3.6.8.8-3.6z" />
        </svg>
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title={t('프로필 편집')}>
        {/* 시트가 닫히면 폼이 사라진다 — 다시 열면 지난 오류·고른 사진 없이 새로 시작한다. */}
        <ProfileForm nickname={nickname} avatarUrl={avatarUrl} onDone={() => setOpen(false)} />
      </Sheet>
    </>
  )
}

function ProfileForm({ nickname, avatarUrl, onDone }: { nickname: string; avatarUrl: string | null; onDone: () => void }) {
  const t = useT()
  const [state, action] = useActionState(saveProfile, null)
  const [preview, setPreview] = useState<string | null>(null)
  const [tooBig, setTooBig] = useState(false)
  useEffect(() => { if (state?.ok) onDone() }, [state, onDone])
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview) }, [preview])
  const photo = preview ?? avatarUrl
  const error = tooBig ? '5MB 이하 사진만 올릴 수 있어요.' : state && !state.ok ? state.error : null

  return (
    // 첫 초점은 폼 자체에 — 닫기 버튼에 주면 열리자마자 초점 테두리가 그려진다.
    <form action={action} className={styles.editForm} tabIndex={-1} data-initial-focus>
      <label className={styles.photoPick}>
        {photo
          ? <CharacterPhoto key={photo} src={photo} alt="" size="avatar" sizes="88px" width={88} height={88} loading="eager" />
          : <LogoMark size={34} />}
        <span className={styles.camera} aria-hidden>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" />
          </svg>
        </span>
        {/* 크기는 여기서 먼저 막는다 — 너무 큰 파일은 서버 액션 한도에 걸려 화면이 오류로 넘어간다. */}
        <input type="file" name="avatar" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" aria-label={t('프로필 사진 바꾸기')} className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (!file) return
            if (file.size > MAX_BYTES) { e.target.value = ''; setTooBig(true); setPreview(null); return }
            setTooBig(false)
            setPreview(URL.createObjectURL(file))
          }} />
      </label>
      <LabeledField label={t('닉네임')} hint={t('캐릭터가 대화에서 부를 이름이에요.')}>
        <CountedInput name="nickname" ariaLabel={t('닉네임')} placeholder={t('예) 지우')} max={PERSONA_LIMITS.name} defaultValue={nickname} required />
      </LabeledField>
      {error && <p role="alert" className="t-caption" style={{ color: 'var(--color-danger)' }}>{t(error)}</p>}
      <SubmitButton variant="secondary" full style={SHEET_BUTTON}>{t('저장')}</SubmitButton>
      {/* 성별·소개는 내 페르소나 화면에 그대로 있다 — 연필이 그 화면으로 가던 길을 대신한다. */}
      <TransitionLink href="/persona?next=/my" className={`hit ${styles.personaLink}`}>{t('성별·소개 바꾸기')}</TransitionLink>
    </form>
  )
}
