/**
 * 운영자 정보 — 약관·처리방침·안내·광고 동의 문서, 사이트 바닥글(SiteFooter), '나' 화면 고객센터가 함께 쓴다. 사용자가 정한 값(2026-10-01, 10/3 주소, 10/7 상호 스터플).
 * Gemini 요금 등급에 따른 데이터 이용 문장은 사용자 요청으로 뺐다(2026-10-01).
 * 비어 있으면 화면·문서에 싣지 않고(지어낸 값을 싣지 않는다), 운영자가 채워야 할 값은 10/5 점검 보고에 적었다.
 */
export const OPERATOR = {
  /** 운영 주체(상호 + 대표자) — 문서의 "운영자" 정의에 쓴다. */
  name: '스터플 대표 조현웅',
  /** 상호(전자상거래법 제10조 ① 1호). */
  brand: '스터플',
  /** 대표자 성명. */
  representative: '조현웅',
  /** 이용자 문의·환불·개인정보 요청을 받는 이메일. '나' 화면 고객센터와 바닥글 고객문의도 이 주소. */
  email: 'ab40905045@gmail.com',
  /** 개인정보 보호책임자 이름(소규모 운영이면 보통 운영자 본인). */
  privacyOfficer: '조현웅',
  /** 사업자등록번호. */
  registrationNumber: '508-14-52353',
  /** 영업소 소재지(10/3 사용자 제공). */
  address: '경상남도 양산시 금오16길 122',
  /** 전화번호 — 전자상거래법 제10조 ①·시행령 제10조가 초기화면 표시를 요구한다(10/5 사용자 제공). */
  phone: '010-4090-5045',
  /**
   * 통신판매업 표시. 운영자는 간이과세자라 신고 의무가 면제된다(전자상거래법 제12조 ④·시행령 제13조, 10/5 사용자 확인) — 면제 사실을 적는다.
   * 나중에 신고하면 '신고번호 2026-경남양산-0001' 처럼 바꾼다. 비우면 싣지 않는다.
   */
  mailOrder: '신고 면제(간이과세자)',
  /** 호스팅 서비스 제공자 — 전자상거래법 제10조 ① 6호(초기화면 표시). 처리방침 6·7항의 수탁자와 같다. */
  hosting: [
    { name: 'Vercel Inc.', role: '웹 서비스' },
    { name: 'Supabase, Inc.', role: '데이터베이스·사진 저장' },
  ],
}

const need = (label: string) => `[${label} 입력 필요]`
export const operatorName = () => OPERATOR.name || need('운영자 이름·상호')
export const operatorEmail = () => OPERATOR.email || need('문의 이메일')
export const privacyOfficer = () => OPERATOR.privacyOfficer || need('개인정보 보호책임자')
export const hostingLine = () => OPERATOR.hosting.map((h) => `${h.name}(${h.role})`).join(', ')

/**
 * 약관 제3조 ①의 사업자 정보 한 줄(전자상거래법 제10조) — 대표자·주소·사업자등록번호·전화·통신판매업 표시(채워진 것만)·호스팅 제공자.
 * 출시 전(이용자 = 운영자 계정뿐)이라 개정 절차 없이 바로 본문에 넣었다(10/5 사용자 결정). 출시 뒤 바꿀 때는 revisions.ts 절차로.
 */
export const businessInfo = () => [
  `대표자 ${OPERATOR.representative} · 주소 ${OPERATOR.address} · 사업자등록번호 ${OPERATOR.registrationNumber}`,
  OPERATOR.phone && `전화 ${OPERATOR.phone}`,
  OPERATOR.mailOrder && `통신판매업 ${OPERATOR.mailOrder}`,
  `호스팅 서비스 제공 ${hostingLine()}`,
].filter(Boolean).join(' · ')
