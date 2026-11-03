'use client'
import { useId, useState } from 'react'
import { UnveilSwitch } from '@/components/unveil-switch'
import { useUnveilEnable } from '@/components/unveil-unlock'
import { useT } from '@/lib/i18n/client'

export function HomeUnveilToggle({ enabled, signedIn }: { enabled: boolean; signedIn: boolean }) {
  const t = useT()
  const [on, setOn] = useState(enabled)
  const { apply, pending, sheets } = useUnveilEnable({ signedIn, returnTo: '/home?unveil=enable', onChange: setOn })
  const descriptionId = useId()
  return <>
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span id={descriptionId} className="sr-only">{t('일반과 언베일의 대화·기억은 따로 보관돼요.')}</span>
      <UnveilSwitch label={t('언베일')} accessibleLabel={t('언베일 (성인 모드)')} describedBy={descriptionId}
        checked={on} disabled={pending} onChange={next => apply(next)} intense />
    </span>
    {sheets}
  </>
}
