/** Public presentation only: colors and phrases already present in the copy, never character prompts. */
export type EditorialPalette = { character: string; user: string; motif: string }
type EditorialTheme = { palette: EditorialPalette; motifs: string[] }
const theme = (character: string, user: string, motif: string, motifs: string[]): EditorialTheme => ({ palette: { character, user, motif }, motifs })

// 11/8 여성향(BL) 캐릭터 삭제로 비움 — 남성향 작품 테마가 생기면 slug 로 추가.
export const CHARACTER_EDITORIAL: Record<string, EditorialTheme> = {
}

export function characterEditorial({ slug, name, genre, occupation }: { slug?: string | null; name: string; genre?: string | null; occupation?: string | null }): EditorialTheme {
  if (slug && Object.hasOwn(CHARACTER_EDITORIAL, slug)) return CHARACTER_EDITORIAL[slug]!
  const themes = /느와르|호러|noir|horror/i.test(genre ?? '')
    ? [theme('#D9AE83', '#C1B3EF', '#92C9BF', []), theme('#ACC9D5', '#C8B4E8', '#D9BE8B', [])]
    : /판타지|미스터리|fantasy|mystery/i.test(genre ?? '')
      ? [theme('#C5ABEF', '#E8B9D0', '#A3D9D1', []), theme('#A5C7F0', '#D2BAEF', '#E4CB91', [])]
      : /힐링|일상|healing|daily/i.test(genre ?? '')
        ? [theme('#A8DCD2', '#D1B6EE', '#E5C599', []), theme('#A7B8EF', '#DDB5D5', '#E5C89E', [])]
        : [theme('#A5BBDA', '#DEB3CA', '#DCC69D', []), theme('#EAAF95', '#D4B1EF', '#A8D7BC', [])]
  const hash = Array.from(name).reduce((sum, char) => sum + char.codePointAt(0)!, 0)
  return { palette: themes[hash % themes.length]!.palette, motifs: occupation && occupation.length >= 2 && occupation.length <= 24 ? [occupation] : [] }
}
