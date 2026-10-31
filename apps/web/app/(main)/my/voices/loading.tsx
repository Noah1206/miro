import { Back, Page } from '@/components/ui'
import styles from '../characters/characters.module.css'
import { MakeTabs } from '../characters/make-tabs'

/** 탭을 누르는 즉시 같은 틀(뒤로·탭)을 보여 준다 — 없으면 마이페이지 전체 뼈대(my/loading)가 잠깐 보였다(10/31). */
export default function Loading() {
  return (
    <Page wide className={styles.page}>
      <div className={styles.frame}>
        <header className={styles.header}><Back href="/my" /><MakeTabs active="voices" /></header>
      </div>
    </Page>
  )
}
