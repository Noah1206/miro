'use client'
import { useEffect, useState, type ReactNode } from 'react'
import { Sheet } from '@/components/ui/sheet'
import { Button } from '@/components/ui'
import { useT } from '@/lib/i18n/client'

const AGREED = 'miro:create-policy:v1'

/** 문장 안 '{link}' 자리에 링크를 끼운다(번역마다 어순이 달라 문장을 통째로 번역한다). */
function withLink(text: string, href: string, label: string): ReactNode {
  const [before, after = ''] = text.split('{link}')
  return <>{before}<a href={href} target="_blank" rel="noopener" style={{ color: 'var(--color-danger)', textDecoration: 'underline', textUnderlineOffset: 3 }}>{label}</a>{after}</>
}

/**
 * 11/21 사용자: 만들기 화면에 들어오면 운영 정책 유의 시트 — '동의하고 캐릭터 제작'을 누르면 이 기기에서는 다시 뜨지 않는다.
 * 그냥 닫으면 다음에 들어올 때 다시 뜬다. 서버에서는 그리지 않는다(동의 여부는 브라우저만 안다).
 */
export function CreatePolicySheet() {
  const t = useT()
  const [open, setOpen] = useState(false)
  useEffect(() => { try { if (!localStorage.getItem(AGREED)) setOpen(true) } catch { setOpen(true) } }, [])
  const agree = () => { try { localStorage.setItem(AGREED, '1') } catch { /* 이번 화면에서만 */ } setOpen(false) }
  const text = { margin: 0, fontSize: 14, lineHeight: 1.6, color: 'var(--color-text-secondary)' } as const
  return <Sheet open={open} onClose={() => setOpen(false)} label={t('캐릭터 제작 시 반드시 유의해 주세요!')} compact>
    <div style={{ display: 'grid', gap: 'var(--space-4)', padding: '8px 0 0' }}>
      <h2 className="t-title-2" tabIndex={-1} data-initial-focus style={{ margin: 0, outline: 'none' }}>{t('캐릭터 제작 시 반드시 유의해 주세요!')}</h2>
      <p style={text}>
        {withLink(t('{link}을 지켜 주세요!'), '/terms/service', t('미로 운영 정책'))}<br />
        {t('안전하고 즐거운 대화 환경을 위해, 운영 정책을 어기면 캐릭터 삭제나 계정 이용 제한 조치를 할 수 있어요.')}
      </p>
      <ul style={{ ...text, paddingLeft: 20, display: 'grid', gap: 2 }}>
        <li>{t('언베일 전용이 아닌 캐릭터의 선정적인 표현, 지나치게 공격적이거나 편향적인 표현')}</li>
        <li>{t('저작권, 초상권 등 다른 사람의 권리를 침해하는 행위')}</li>
        <li>{t('딥페이크, 허위 정보, 미성년자를 성적으로 표현하는 등 비윤리적이거나 불법적인 행위')}</li>
      </ul>
      <p style={text}>{withLink(t('{link}을 포함한 운영 정책을 반복해서 어기면 제재가 강해질 수 있어요.'), '/terms/adult', t('언베일(성인 콘텐츠) 이용 정책'))}</p>
      <Button type="button" variant="primary" full onClick={agree} style={{ marginTop: 'var(--space-2)' }}>{t('동의하고 캐릭터 제작')}</Button>
    </div>
  </Sheet>
}
