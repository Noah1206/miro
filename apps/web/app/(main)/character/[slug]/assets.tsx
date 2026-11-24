import Link from 'next/link'
import type { Asset } from '@/lib/play/assets'
import { getT } from '@/lib/i18n/server'
import s from './assets.module.css'

const FIRST = 12

/**
 * 11/25 사용자: 작품 에셋(상황 사진)을 상세에서 본다. 언베일 사진은 언베일 켠 성인 인증 회원에게만 주소가 오고,
 * 그 밖엔 19 흐림 칸(누르면 언베일 켜기로). 12장 다음은 '전체 보기'로 펼친다.
 */
export async function AssetGallery({ assets, cover, unlockHref }: { assets: Asset[]; cover: string | null; unlockHref: string }) {
  if (!assets.length) return null
  const t = await getT()
  const cell = (a: Asset) => (
    <li key={a.id}>
      {a.img
        ? <a href={a.img} target="_blank" rel="noreferrer"><img src={a.img} alt="" loading="lazy" /></a>
        : <Link href={unlockHref} className={s.locked} aria-label={t('언베일 카드')}>{cover && <img src={cover} alt="" loading="lazy" />}<i>19</i></Link>}
    </li>
  )
  return (
    <section aria-labelledby="assets" className={s.wrap}>
      <h2 id="assets" className="t-title-3">{t('에셋')} <small>{assets.length}</small></h2>
      <ul className={s.grid}>{assets.slice(0, FIRST).map(cell)}</ul>
      {assets.length > FIRST && (
        <details className={s.more}>
          <summary>{t('전체 보기 ({n})', { n: assets.length })}</summary>
          <ul className={s.grid}>{assets.slice(FIRST).map(cell)}</ul>
        </details>
      )}
    </section>
  )
}
