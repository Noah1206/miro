import { msg } from './index'

/**
 * 키 모으기 스크립트(scripts/i18n-keys.mts)가 코드에서 찾지 못하는 화면 문구 — 다른 패키지(domain·providers)나
 * SQL 이 만들어 화면이 t() 로 번역하는 말. 원문이 바뀌면 여기도 함께 고친다.
 * ponytail: 손으로 맞추는 목록, 자주 어긋나면 스크립트가 그 모듈을 직접 읽게.
 */
export const EXTRA_KEYS = [
  // domain relationship/describe.ts stageLabel
  msg('감정이 복잡함'), msg('낯선 사이'), msg('조금 익숙해짐'), msg('일로 얽힌 사이'), msg('가까워지는 중'), msg('편한 사이'),
  msg('서로를 재는 중'), msg('멀어지는 중'), msg('서로를 의식함'), msg('아직 풀리지 않음'), msg('특별한 사이'), msg('연인'),
  // domain character/types.ts BUILD_PRESETS·GENDER_PRESETS
  msg('마름'), msg('표준'), msg('근육질'), msg('과체중'), msg('남성'), msg('여성'),
  // providers OAUTH_LABEL
  msg('카카오'),
  // lib/wallet/service.ts 내역 줄의 label·status (SQL case)
  msg('ECHO 대화'), msg('Pro 1개월 이용권'), msg('가입 선물'), msg('기한 지남'), msg('대화 이어가기 제공량'), msg('라이브 장면'),
  msg('사용 완료'), msg('사용 중'), msg('사진 생성'), msg('영상통화'), msg('음성통화'), msg('입금 대기'), msg('지급 대기'),
  msg('지급 완료'), msg('차감 취소'), msg('추가 인터랙션'), msg('취소됨'), msg('크레딧 지급'), msg('크레딧 충전 주문'),
  msg('크레딧 충전'), msg('환불됨'),
]
