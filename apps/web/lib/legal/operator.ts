/**
 * 운영자 정보 — 약관·처리방침·안내·광고 동의 문서와 '나' 화면 고객센터가 함께 쓴다. 사용자가 정한 값(2026-10-01).
 * Gemini 요금 등급에 따른 데이터 이용 문장은 사용자 요청으로 뺐다(2026-10-01).
 * 비어 있으면 문서에 '입력 필요' 로 드러난다 — 지어낸 값을 싣지 않는다.
 */
export const OPERATOR = {
  /** 운영 주체(개인 이름 또는 상호). */
  name: '현웅통신 대표 조현웅',
  /** 이용자 문의·환불·개인정보 요청을 받는 이메일. '나' 화면 고객센터 줄도 이 주소로 연다. */
  email: 'ab40905045@gmail.com',
  /** 개인정보 보호책임자 이름(소규모 운영이면 보통 운영자 본인). */
  privacyOfficer: '조현웅',
  /** 사업자 정보 — 대표자, 주소, 전화, 사업자등록번호, 통신판매업 신고번호(전자상거래법 제10조·제13조, 유료 판매 시). */
  /** 10/3 사용자 제공: 주소·전화. 통신판매업 신고번호는 아직 없음 — 받으면 덧붙인다. */
  business: '대표자 조현웅 · 주소 경상남도 양산시 금오16길 122 · 전화 010-4090-5045 · 사업자등록번호 508-14-52353',
}

const need = (label: string) => `[${label} 입력 필요]`
export const operatorName = () => OPERATOR.name || need('운영자 이름·상호')
export const operatorEmail = () => OPERATOR.email || need('문의 이메일')
export const privacyOfficer = () => OPERATOR.privacyOfficer || need('개인정보 보호책임자')
export const businessInfo = () => OPERATOR.business || need('사업자 정보(대표자·주소·전화·사업자등록번호·통신판매업 신고번호)')
