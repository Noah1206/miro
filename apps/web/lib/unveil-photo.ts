/** 언베일 수위 갤러리 사진(11/4) — 올릴 때 파일 이름을 `unveil-…` 로 붙인다(upload-bl-photos u1.jpg…). 언베일을 안 켠 사람에겐 이 사진만 흐린다. */
export const isUnveilPhoto = (src: string | null | undefined) => !!src && /\/unveil-[^/?]+(\?|$)/.test(src)
