# PM Status — MIRO

**Last briefing**: 2026-09-22 00:05
**Current focus**: 선톡(realityMessage) 운영 개방 완료·cron 200 검증됨. 미로 카나리아 = 서연(tone2 테스트 계정 소유). 남은 관문: 실캐릭터 제작·지정, 실기기 로그인·토스, 첫 실제 선톡 관찰(quiet hours 해제되는 08:00 이후).
**Active sprint goal**: 초대 베타 — 사용자 본인 캐릭터 제작→미로 지정, 실기기 로그인·토스 확인

## 상태 요약 (2026-09-22 00:05)
- 운영: https://miro-web-ashen.vercel.app = **b46a8f7**. 포함: 선톡 개방(내 커밋) + 유저의 9/21 지연 개선·주황 액센트·icn1 리전(8987cee·d04d159).
- health: `realityMessage: true`, inlineReality false(프리셋), 미디어 4종 off(하드 차단 유지). llm live(`gemini/gemini-3.8-flash`), voice live, push live.
- **9/21 밤 인시던트**: 개방 첫 틱(23:45)이 500 — 운영 DB 에 `reality_push_jobs` 테이블 부재(마이그레이션 `20260915100230_reality_notification_outbox.sql` 미적용). 게이트가 항상 일찍 반환해 잠복해 있었음. supabase migration `reality_notification_outbox` 로 적용, 00:00 틱 200 확인. 전체 마이그레이션 replay 를 스크래치 DB 에 만들어 운영과 컬럼 단위 대조 — 이제 차이는 죽은 레거시 `alpha_sessions`/`alpha_ai_calls` 뿐(코드 참조 0, 의도적으로 미생성).
- 운영 DB 정체: users 7 = 실계정 1(본인 구글) + **tone 테스트 계정 6**(9/21 말투 테스트). characters 1 = 서연(tone2 소유, 비공개, 40 메시지) → **미로(reality) 로 카나리아 지정**(SQL 직접, admin 감사로그 없음 — admin 에서 되돌리면 정리까지 자동).
- cron: 23:45 틱에서 서연 세션 claim·평가 실행 확인(reality_checked_at 기록). 발송 0 은 quiet hours(기본 23:00–08:00)·동기 임계값과 정합. 첫 실제 선톡은 08:00 이후 상태에 따라.
- 위생: `.env.bak-*` 2개 삭제됨. 로컬 Node 18(스토리지 테스트 2개가 `File` 전역 부재로 실패 — CI 는 신형 Node 라 green). 로컬 `miro_dev` DB 는 낡음(최근 개발은 운영 DB 직결).

## 결정 로그
- 2026-09-22: 선톡 운영 개방 — features.ts 하드 차단에서 realityMessage·inlineReality 제거(b46a8f7), 미디어 4종은 검증 전까지 유지. 미로 카나리아로 서연(테스트 계정 소유) 지정 — 실계정 영향 없이 파이프라인 검증 목적, 실캐릭터 제작 후 교체.
- 2026-09-22: 운영 DB 마이그레이션 누락 1건(`reality_push_jobs`) 적용. 레거시 alpha 테이블 2개는 코드 미참조라 미생성 유지.
- 2026-09-19: 음성통화 = Gemini Live API(gemini-3.8-live, ephemeral token 클라이언트 직결). 서버는 토큰 발급만(모델·프롬프트·보이스 잠금). ≈$0.023/분, 차감 5 units/분 유지. 실패 시 텍스트 강등. 게이트: 실기기 검증·원가 실측 후 운영 개방. 음성 발화 기억 저장은 v2. → 구현 완료(df52536), 개방 전.
- 2026-09-19: Live Scene v1 = 이미지 전면 배제, 텍스트 연출 + 스트림 인라인 장면 전환. Reality 전용, 무차감. → 구현 완료(24f4937), 운영 off.
- 2026-09-19: AI 사진 기능 스코프 삭제. 시각 보상은 Live Scene 으로 통합. photo 코드 경로 정리는 미디어 트랙 때.
- 2026-09-18: 출력 스타일 수동 선택 폐지 → 인터랙션·장면 기반 자동(`styleDirective`). 구현 완료(d64a37c).
- 2026-09-16: 제공량 Free 200 / Pro 1,000 units. 충전 300~7,500 units(3천~5만원). 구독제 폐지 → 1개월 이용권 9,900원, PG 없이 계좌이체+운영자 승인, 토스 딥링크. 환불 법정 기준.
- 2026-09-16: cron 주 경로 pg_cron(*/15), GitHub Actions 백업(5시간 지연 실측).
- 2026-09-16: 홈=chat / 미로=reality, 지정은 superadmin 만. 운영 캐릭터는 시드 없이 사용자가 새로 제작.
- 2026-09-15: 멀티 캐릭터 보류.

## 미해결 질문
- [ ] 정식 미로 캐릭터: 사용자 본인 제작분으로 서연(카나리아) 교체 시점. 교체 시 서연은 admin 에서 홈으로 되돌리기(대기 의도·Push 정리 포함)
- [ ] 초기화 기준(월초 vs 결제일), Free 충전 허용, 해지 후 잔액, 선톡 차감 시점
- [ ] 캐릭터 생성 폼의 외형 입력 유지 여부 (소비처가 미구현 영상통화뿐)
- [ ] 미디어 가중치 실측(`pnpm ai:cost`) — 미디어 개방 전

## 차기 마일스톤
**M-초대베타** — 잔여: ① 카나리아 첫 선톡 관찰(08:00 이후)과 답장 왕복 확인 ② 사용자 본인 캐릭터 제작→미로 지정 ③ 실기기 구글 로그인(Supabase redirect)·토스 딥링크 ④ 출시 게이트 중 최소 백업 복원·모니터링 알림. (split 배포 ✅ · reality 개방 ✅)
**M-공개** — 음성통화 실기기 검증 후 voiceCall 개방, Live Scene 개방, 미디어 원가 실측, 문서 갱신
