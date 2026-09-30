import { redirect } from 'next/navigation'

/** 미로 탭은 없앴다(2026-09-30 요청) — 예전 /miro 링크는 홈의 R 토글(미로 캐릭터만)을 켠 채로 연다. */
export default function Miro() {
  redirect('/home?r=1')
}
