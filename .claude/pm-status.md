# PM Status — MIRO

**Last briefing**: 2026-09-21 23:30
**Current focus**: 최신 main(bed3f16)이 운영에 배포됨(홈/미로 분리 포함). 유저 7명 유입, 캐릭터 1개 생성. 그러나 미로(reality) 지정 0 + 운영 realityMessage 차단 → 선톡은 아직 아무에게도 안 나감.
**Active sprint goal**: 초대 베타 — 미로 캐릭터 지정 + realityMessage/inlineReality 운영 개방 → 실기기 로그인·토스 확인

## 상태 요약 (2026-09-21)
- 운영: https://miro-web-ashen.vercel.app 이 **bed3f16(최신 main)** 으로 배포됨. `/miro` 200 — 홈/미로 분리 배포 완료.
- health: ai.ready true, llm live(`gemini/gemini-3.8-flash`), voice **live**, push live. features: relationship/memory/event/memorySummaries/memoryExtraction on. **realityMessage·inlineReality·voiceCall·liveScene·image·video off** (productionRuntime 차단).
- 운영 DB: users **7** / characters **1** / reality 지정 **0** / orders **0**.
- cron: pg_cron `miro-reality-scheduler` */15 active, 2026-09-21 23:15 KST까지 succeeded 연속. 스케줄 SQL 은 저장소(`packages/db/migrations/20260919160000_reality_cron.sql`)에 있음.
- 9/16 이후 15커밋: Gemini Live 음성통화 구현(provider+tests, 운영 미개방), Live Scene 인라인 장면 전환, 스트리밍 도착, 출력 스타일 자동화, 캐릭터 지식(lore)+회상, 기억 태그 UI, 모델 출력 모양 오류 내성 3건, E2E 자립화(DB·운영자 자동 준비), 실패 턴 기다림 처리.
- E2E 스펙 18개 파일. 마지막 확인 수치(9/16): 단위·통합 426, E2E 51/51 — 이후 재측정 안 함.
- 위생: 루트에 `.env.bak-*` 2개 untracked(시크릿 사본), `.Codex/config.toml` 미커밋 수정.

## 결정 로그
- 2026-09-19: 음성통화 = Gemini Live API(gemini-3.8-live, ephemeral token 클라이언트 직결). 서버는 토큰 발급만(모델·프롬프트·보이스 잠금). ≈$0.023/분, 차감 5 units/분 유지. 실패 시 텍스트 강등. 게이트: 실기기 검증·원가 실측 후 운영 개방. 음성 발화 기억 저장은 v2. → 구현 완료(df52536), 개방 전.
- 2026-09-19: Live Scene v1 = 이미지 전면 배제, 텍스트 연출 + 스트림 인라인 장면 전환. Reality 전용, 무차감. → 구현 완료(24f4937), 운영 off.
- 2026-09-19: AI 사진 기능 스코프 삭제. 시각 보상은 Live Scene 으로 통합. photo 코드 경로 정리는 미디어 트랙 때.
- 2026-09-18: 출력 스타일 수동 선택 폐지 → 인터랙션·장면 기반 자동(`styleDirective`). 구현 완료(d64a37c).
- 2026-09-16: 제공량 Free 200 / Pro 1,000 units. 충전 300~7,500 units(3천~5만원). 구독제 폐지 → 1개월 이용권 9,900원, PG 없이 계좌이체+운영자 승인, 토스 딥링크. 환불 법정 기준.
- 2026-09-16: cron 주 경로 pg_cron(*/15), GitHub Actions 백업(5시간 지연 실측).
- 2026-09-16: 홈=chat / 미로=reality, 지정은 superadmin 만. 운영 캐릭터는 시드 없이 사용자가 새로 제작.
- 2026-09-15: 멀티 캐릭터 보류.

## 미해결 질문
- [ ] 미로 대상 캐릭터: 현재 유일한 캐릭터 1개를 지정할지, 새로 제작할지 (사용자 결정 대기 — 이게 선톡 개방의 마지막 관문)
- [ ] realityMessage·inlineReality 운영 개방 시점 (미로 지정과 동시 권장)
- [ ] 초기화 기준(월초 vs 결제일), Free 충전 허용, 해지 후 잔액, 선톡 차감 시점
- [ ] 캐릭터 생성 폼의 외형 입력 유지 여부 (소비처가 미구현 영상통화뿐)
- [ ] 미디어 가중치 실측(`pnpm ai:cost`) — 미디어 개방 전

## 차기 마일스톤
**M-초대베타** — 잔여: ① 미로 캐릭터 지정+reality feature 개방 → cron 선톡 실확인 ② 실기기 구글 로그인(Supabase redirect)·토스 딥링크 ③ 출시 게이트 중 최소 백업 복원·모니터링 알림. (split 배포 ✅ 완료)
**M-공개** — 음성통화 실기기 검증 후 voiceCall 개방, Live Scene 개방, 미디어 원가 실측, 문서 갱신
