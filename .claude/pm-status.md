# PM Status — MIRO

**Last briefing**: 2026-09-23 01:10
**Current focus**: **선톡 발송 경로가 운영에서 처음 끝까지 돌았다**(01:01 KST, 검증 레버). 카나리아(서연)는 mock 대화라 자연 발송은 불가능했고, 사건 1건을 넣어 생성→메시지→contacts 까지 확인. 남은 미검증 단계는 Push 배달뿐(구독 0건) — 실기기 로그인·Push 허용이 다음 관문.
**Active sprint goal**: 초대 베타 — 실기기 로그인·Push 구독 → 본인 캐릭터 제작·미로 지정 → live 대화로 관계 축적 → 첫 선톡

## 상태 요약 (2026-09-23 00:55)
- 운영: https://miro-web-ashen.vercel.app = **7cf48d6**. health ok, db up, `realityMessage: true`, 미디어 4종 off, llm live(`gemini/gemini-3.8-flash`), push·voice live.
- 9/22 배포분: 디자인 패턴 문서 위반 수정(d1cd4c2), 짙은 주황 액센트·내비 재설계(3acb192~7f2d44a), 홈 토글·빈 상태 한 줄 가운데 정렬(ed6ffba~38b9a8c), AI 동의 e2e 경쟁 수정(7cf48d6). 단위·E2E 52/52(깨끗한 테스트 DB 기준).
- cron: 15분마다 200, errors 0 (pg_net 응답은 6시간만 보관). 서연 세션은 30분마다 claim 되고 매번 `no_intent`.
- **카나리아 진단**: 서연 세션 20턴은 `ai_usage.provider = mock`(9/21 16~17시 KST, "지금은 뭐 해?" 13회 반복). 결과 relationships = stranger(애착 5·신뢰 30·정서적 거리 65), memories 0, events 0, pending_reality_intent 없음. `deriveIntent` 는 사건 없음 + (애착≥40·거리≤55) 불충족 → null. 의도를 넣어도 motivation = 0.475×0.3 + 0.175×0.3 + urgency×0.35 − 0.65×0.35 ≈ 0.28(urgency 0.9) < 임계 0.5 → `no_motivation`. 사건 1건이 active 면 +0.3 으로 0.51 → 발송 가능(활성 08–23시·quiet hours 밖).
- **검증 레버 결과(01:01 KST)**: 서연 세션에 `events`(misunderstanding, active) 1건 삽입 + 서연 활성 시간 임시 00:00–23:59 + `reality_checked_at` NULL → 크론 수동 호출(`Authorization: Bearer <ops_cron_config.secret>`). 응답 `{claimed:1, results:{sent:1}, errors:0}`, 6.6초. 생성물: "어제 물어본 거 바로 답 못해서 신경 쓰였어. 별일 있는 건 아니지? 시간 날 때 연락 줘."(tone warm). DB: `messages` kind=reality_message + reality 블록, `reality_contacts` sent(dedupe `message:<eventId>:event:misunderstanding`), `pending_reality_intent` 비움, push job 0(구독 없음·quiet hours). ai_usage 3행 = moderation(gemini-3.5-flash-lite) → dialogue(gemini-3.8-flash) → moderation, 추정 비용 ≈ $0.0013/건, `actual_cost` 는 비어 있음(estimated 만 기록). 정리: 활성 시간 08:00–23:00 복원, 사건 resolved → 재실행 시 `no_intent`·LLM 호출 0 확인. **운영 DB 의 live LLM 호출 기록은 이 3행이 전부** — 실계정 대화는 아직 한 번도 없었다.
- 발견한 비효율(칩 task_e5fafa76): 사건이 resolved 되지 않으면 쿨다운(90분) 뒤 매 판단마다 LLM 3회를 돌린 뒤 UNIQUE 위반으로 버린다. 생성 전에 dedupe_key 로 걸러야 한다.
- **알림 허용 UI 가 없었다(9/23 수리, fa99eeb)**: `PushSubscribe` 가 9/13 홈 공개 커밋(e7b3dfa)에서 홈에서 빠진 뒤 어디에도 안 붙어, 설정의 '먼저 연락 알림' 스위치는 값만 저장하고 브라우저 권한·구독은 아무도 만들 수 없었다. 스위치 아래 한 행으로 붙임(알림 켜기 → 모달 → 권한 요청 → `/api/push` 저장). iPhone Safari(비-PWA)에는 '공유 → 홈 화면에 추가' 안내. CI(E2E 포함) green. 로그인 상태 렌더링은 실기기에서 확인 예정.
- 실기기 경로: 이 Mac 에 Chrome 없음(Brave·Safari 뿐, Claude in Chrome 미연결), 내장 브라우저는 알림 거부 상태, iPhone 미러링은 사용자 거부 → ③은 사용자가 폰에서 직접. 완료 신호 = `push_subscriptions` 에 실계정 행.
- GitHub Actions 백업 크론(`cron.yml`)이 9/19 이후 **401** 로 실패했었다 — 저장소 `CRON_SECRET`(9/16 설정)이 9/19 에 바뀐 운영 값과 달랐다. 9/23 02:29 `gh secret set` 으로 `ops_cron_config.secret` 값에 맞추고 수동 실행(workflow_dispatch) 200 확인. pg_cron 주 경로는 내내 정상.
- Push 구독 0건(어느 계정도 기기 등록 없음). 실계정(ab40905045@gmail.com) 세션 0. 서연은 비공개(is_public=false)라 미로 탭은 모든 계정에서 빈 화면 — 카나리아 목적과 정합.
- 운영 env: GOOGLE/KAKAO 클라이언트, AUTH_BASE_URL, VAPID, MIRO_BANK_ACCOUNT, MIRO_RECHARGE_PRODUCTS 모두 설정됨. 콜백 경로 `/api/auth/{provider}/callback`.
- 위생: `.claude/launch.json` 미추적(로컬 실행 설정, nvm 경로 포함). E2E global-setup 이 실행 시작 때 테스트 DB 를 비운다(2026-09-23, `TRUNCATE … RESTART IDENTITY CASCADE`, ops_cron_config 유지, localhost·`_test` 재검사 통과 시에만). 누적은 해소됐지만 flaky 의 원인은 아니었다 — 빈 DB 로 6연속 실행해도 ai-platform 동의 저장·ops quiet hours·성인 인증이 첫 시도(때로 재시도까지) 10초 시간 초과. trace 기준 서버는 액션 결과를 9~20ms 에 정상 반환(통과·실패 응답 본문 동일)하는데 클라이언트가 반영하지 않는다. 1 워커로는 3/3 통과, 3 워커 + 머신 부하(RAM 8GB·스왑 3.6/4GB·XProtect 스캔)에서 재현. 스위트 시간 1.5m→2.4m 증가도 CPU 시간은 일정하고 wall time 만 늘어난 것이라 메모리 압박 쪽. 클라이언트 쪽 원인 추적은 별도 칩.

## 결정 로그
- 2026-09-22: 내비 = 꽉 찬 실루엣 아이콘 32px + 라벨, 활성은 주황 아이콘만(배경·점·윤곽 없음), 미로 탭 = 겹친 두 카드. 홈 전체·인기 = 작은 세그먼트 토글. 빈 상태 = 상자·버튼 없는 한 줄, 남은 공간 세로 가운데(`.empty-state--fill`). '나' 화면만 푸터가 있어 한 줄 고정.
- 2026-09-22: UI 규칙 기준 = `docs/MIRO_DESIGN_PATTERNS.md` (DESIGN.md 와 충돌 시 패턴 문서 우선). 전 화면 감사 후 위반 수정: micro 12px, 터치 44px(`.hit` 유틸), SubmitButton(제출 잠금), 빈 상태 CTA, 색상 단독 표시 보완. 단위 473·E2E 52 통과.
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
**M-초대베타** — 순서 재조정(카나리아 진단 반영): ③ 실기기 구글 로그인 + Push 허용(구독 1건 확보) → ② 본인 캐릭터 제작→admin 에서 미로 지정→live 대화(관계·사건이 실제로 쌓이는지 relationships 로 확인) → ① 첫 선톡 관찰: 발송 경로는 검증 레버로 ✅(9/23). 남은 것은 실계정 세션에서의 자연 발생(애착≥40·거리≤55 + 침묵 ≈42h @빈도 45, 또는 사건)과 Push 배달·답장 왕복 → ④ 최소 알림(코드에 알림 경로 0건, `observe` 만 있음)·백업 복원(로컬 리허설만 됨). (split 배포 ✅ · reality 개방 ✅ · UI 트랙 ✅)
**M-공개** — 음성통화 실기기 검증 후 voiceCall 개방, Live Scene 개방, 미디어 원가 실측, 문서 갱신
