// 11/4: 화면에 띄우는 작품 제목은 대표 사진 제목 로고와 같게. 대화 속 이름(c.name)은 그대로 둔다.
const COVER_TITLES: Record<string, string> = {
  'official-m-han-doeun': '사기당한 집에 그녀가 있었다',
  'official-m-yoon-seoa': '하루짜리 남자친구',
  'official-m-baek-jiyoon': '폭우 속 팀장님',
  'official-m-seo-rin': '옆집 유부녀의 열린 현관문',
  'official-m-ryu-hagyeong': '한달짜리 남편',
  'official-m-han-yujin': '친구 엄마의 밤',
  'official-m-hero-party': '동창회에서 하는 NTR',
  'official-m-boarding-house': '사모님들 빼앗기',
  'official-m-living-doll': '오나홀이 살아났다',
  'official-m-reverse-world': '정조역전 세계',
  'official-m-idol-girlfriend': '아이돌 여자친구',
  'official-m-stray-cat': '구해준 길고양이가 수인이 되었다',
}

export const coverTitle = (c: { slug?: string | null; name: string }) => (c.slug && COVER_TITLES[c.slug]) || c.name
