/** Public presentation only: colors and phrases already present in the copy, never character prompts. */
export type EditorialPalette = { character: string; user: string; motif: string }
type EditorialTheme = { palette: EditorialPalette; motifs: string[] }
const theme = (character: string, user: string, motif: string, motifs: string[]): EditorialTheme => ({ palette: { character, user, motif }, motifs })

export const CHARACTER_EDITORIAL: Record<string, EditorialTheme> = {
  'official-cha-dogyeom': theme('#D9AE83', '#C1B3EF', '#92C9BF', ['흑룡경비', '유일한 목격자', '경호', '한남동', '쿠로류카이']),
  'official-baek-dohyun': theme('#C5ABEF', '#E8B9D0', '#A3D9D1', ['기억 전당포', '기억 하나', '유리병', '기한 하루 전', '30일']),
  'official-seo-ian': theme('#A7B8EF', '#DDB5D5', '#E5C89E', ['새벽 두 시', '불 켜진 창', '사연', '새벽 4시', '헤드폰']),
  'official-oh-junseo': theme('#ACC9D5', '#C8B4E8', '#D9BE8B', ['도서관 3층', '철문', '비상등', '사흘', '사이렌']),
  'official-ryu-haram': theme('#D9A7CA', '#BBAFEF', '#A5CCD7', ['새벽 3시 10분', '뮤지션', '복권', '햇빛', '홍대']),
  'official-park-doha': theme('#EAAF95', '#D4B1EF', '#A8D7BC', ['부산', '전학', '사투리', '매니저', '여기 앉아']),
  'official-jung-siwoo': theme('#9DC8D5', '#BDB2EC', '#DAC59A', ['청운고', '학생회', '전교 1등', '구관', '실종']),
  'official-lee-taeo': theme('#A8DCD2', '#D1B6EE', '#E5C599', ['제로', '감정 봉인구', '한빛 특수고', '옆자리', '폭주']),
  'official-han-jiseob': theme('#B2C8E5', '#DBB4CC', '#E3C18A', ['북주', '북방', '열두 성', '정략혼', '황실']),
  'official-kang-mujin': theme('#B8CCA0', '#DDBBCA', '#E7CCA3', ['해병대', '3년 연인', '산장', '폭설', '장작 난로']),
  'official-ha-jinhyuk': theme('#A5C7F0', '#D2BAEF', '#E4CB91', ['아스테르 아카데미', '서열 2위', '절단', '무효', '파트너']),
  'official-gu-manseok': theme('#DCA3AA', '#C5B4ED', '#DFBE95', ['천룡회', '사흘째', '자취방', '숙부', '회장']),
  'official-do-yunjae': theme('#A5BBDA', '#DEB3CA', '#DCC69D', ['전략기획팀', '최연소 팀장', '엘리베이터', '6시간', '한결기획']),
  'official-kang-seheon': theme('#C2A8F0', '#DBAEC7', '#91D4D1', ['S급', '측정 불가', '힐러', '전속 계약', '세헌 길드']),
}

export function characterEditorial({ slug, name, genre, occupation }: { slug?: string | null; name: string; genre?: string | null; occupation?: string | null }): EditorialTheme {
  if (slug && Object.hasOwn(CHARACTER_EDITORIAL, slug)) return CHARACTER_EDITORIAL[slug]!
  const themes = /느와르|호러|noir|horror/i.test(genre ?? '')
    ? [CHARACTER_EDITORIAL['official-cha-dogyeom']!, CHARACTER_EDITORIAL['official-oh-junseo']!]
    : /판타지|미스터리|fantasy|mystery/i.test(genre ?? '')
      ? [CHARACTER_EDITORIAL['official-baek-dohyun']!, CHARACTER_EDITORIAL['official-ha-jinhyuk']!]
      : /힐링|일상|healing|daily/i.test(genre ?? '')
        ? [CHARACTER_EDITORIAL['official-lee-taeo']!, CHARACTER_EDITORIAL['official-seo-ian']!]
        : [CHARACTER_EDITORIAL['official-do-yunjae']!, CHARACTER_EDITORIAL['official-park-doha']!]
  const hash = Array.from(name).reduce((sum, char) => sum + char.codePointAt(0)!, 0)
  return { palette: themes[hash % themes.length]!.palette, motifs: occupation && occupation.length >= 2 && occupation.length <= 24 ? [occupation] : [] }
}
