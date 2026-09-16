# PM Status — MIRO

**Last briefing**: 2026-09-16 22:10
**Current focus**: 배포된 앱(e3aa78c)은 판매·AI 켜짐, 그러나 캐릭터 0개. main(9241e3b)의 홈/미로 분리는 미배포. cron 은 pg_cron 으로 15분 복구됨.
**Active sprint goal**: 초대 베타 — 캐릭터 신규 제작(사용자)·미로 지정 → split 배포 → 실기기 로그인·토스 확인

## 상태 요약 (2026-09-16)
- 운영: https://miro-web-ashen.vercel.app (web) · https://miro-admin-five.vercel.app (admin, admin@miro.dev). Vercel Hobby, git 자동배포 없음(수동 `vercel deploy --prod`).
- 운영 DB: users 1 / characters 0 / reality 0 / orders 0. 마이그레이션 최신(experience_type 포함) 적용됨.
- 결제: 계좌이체(카카오뱅크 3333362382600 조현웅) 열림. 이용권 9,900원/30일·자동갱신 없음, 충전 5단계(3천~5만), 환불 법정기준(7일 미사용분), 결제 상한 없음(운영자 30일 합계 표시). 운영자 승인 → cron 지급.
- AI: gemini-3.5-flash-lite 무료 티어, AI_DAILY_BUDGET=1 안전망. 운영 realityMessage·inlineReality·사진·통화·Live 는 코드로 차단(productionRuntime).
- 홈/미로 분리(9241e3b): experience_type chat|reality, 서버 경계 5곳, /miro, /home/search, 운영 콘솔 /characters 지정. 미배포. 미로 대상 미지정.
- 테스트: 단위·통합 426, E2E 51/51, CI green. `ops.spec` 성인인증·quiet hours 는 부하 시 첫 시도 flaky(main 에서도 동일).
- cron: 주 경로는 운영 Postgres pg_cron 잡 `miro-reality-scheduler`(*/15, pg_net → /api/cron/reality). 2026-09-16 22:00·22:15 KST 정시 실행 확인(HTTP 200). GitHub Actions 는 백업(실측 5시간 지연).

## 결정 로그
- 2026-09-16: 제공량 Free 200 / Pro 1,000 units. 충전 300/800/1,800/4,200/7,500 (10원→6.67원/unit).
- 2026-09-16: 구독제 폐지 → 1개월 이용권. 만료 3일 전·당일 알림. 해지 버튼 없음.
- 2026-09-16: PG 안 씀. 계좌이체 + 운영자 승인. 토스 딥링크(`supertoss://send`)로 원클릭, 카뱅은 앱 열기+계좌 복사.
- 2026-09-16: 환불 = 법정(7일 미사용분 전액, 이용권 일할). 결제 상한 없음, 운영자 화면에 최근 30일 합계.
- 2026-09-16: cron 을 GitHub Actions 로 이전 → 5시간 지연 실측 → pg_cron+pg_net 으로 주 경로 교체, Actions 는 백업 유지.
- 2026-09-16: 홈=chat, 미로=reality. 시드·공식 캐릭터 자동 편입 안 함. 지정은 superadmin 만. 알파(유진)도 지정 전엔 선톡 없음.
- 2026-09-16: 운영 DB 사용자·캐릭터 정리(테스트 계정 2, 캐릭터 3 삭제). 본인 계정만 남김.
- 2026-09-16: 운영 캐릭터는 시드 투입 없이 **새로 제작**(사용자 직접). 로컬(운영 DB) /create → 편집에서 공개 → admin /characters 로 미로 지정.
- 2026-09-15: 멀티 캐릭터 보류, ECHO 는 같은 모델에 자원만 더 씀.

## 미해결 질문
- [ ] 미로 대상 캐릭터 (사용자가 정하기로 함). 알파 유진 포함 여부
- [ ] 초기화 기준(월초 vs 결제일), Free 의 충전 구매 허용, 해지 후 잔액, 선톡 차감 활성 시점
- [ ] 미디어 가중치(photo 10 / faceCast 15 / video 20) 실측 — 미디어 열기 전 `pnpm ai:cost`

## 차기 마일스톤
**M-초대베타** — 잔여: 캐릭터 신규 제작+미로 지정, split 배포, 실계정 구글 로그인(Supabase redirect 확인), 실기기 토스 딥링크, 출시 게이트(백업 복원·모니터링 알림·부하) 중 최소 백업·알림
**M-공개** — 순서 6(Reality 실검증), 미디어 원가 실측 후 활성화, 문서 갱신(명세서·유저플로우·IMPLEMENTATION_PLAN 의 발견/구독 표기)
