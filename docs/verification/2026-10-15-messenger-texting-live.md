# 문자 말투 실제 모델 검증

2026-10-15 · Claude Sonnet 5.5 · `reality:v5-texting-voice`

운영 모델 라우터·비용 제한·사용량 기록을 사용하는 실제 `generateRealityContent` 호출로 합성 상황 14종을 각각 2회 검증했다. 실제 사용자에게 발송하거나 캐릭터 상태를 변경하지 않았다. 모델 비용은 운영 사용량 기록에 남겼다. 고객 대화 전체 경로나 모든 캐릭터의 장기 문체 품질을 보증하는 검사는 아니다.

최종 28/28 통과. 길이·분량 예외·존댓말·문장부호·금지 표현은 자동 검사하고, 실제 출력은 성격·상황과 함께 읽어 확인했다.
일반 문자 26건은 12~66자, 평균 30.2자였다. 자세한 설명 요청 2건은 150, 155자로 별도 분류됐다.
최종 실행 28회, 추정 모델 비용 $0.2907. 요금 청구서가 아닌 사용량 추정치다.

초기 검토에서는 “너는?” 같은 자연스러운 되묻기와 “다 괜찮진 않아” 같은 부정문을 검사식이 오판해 평가 기준을 바로잡았다. 바쁜 답장에 승인되지 않은 “끝나면 문자할게” 약속이 붙은 사례도 있어 새 약속을 덧붙이지 않도록 지침을 보완했다. 그 뒤 전체 28건을 새로 생성해 검증했다.

관련 자동 검사 52개 통과: 실제 DB 저장·연락 경계·열람 분리·사진과 일반 문자 전송, 길이 초과 재시도, 장문 예외 보존, 내부 분량 정보 비노출. 루트·웹·실측 스크립트 타입 검사 통과. DB 마이그레이션과 화면 변경은 없다.

## 실제 생성 결과

| 상황 | 회차 | 글자 수 | 분량 판단 | 출력 |
|---|---:|---:|---|---|
| terse-meal | 1 | 13 | brief | 응, 방금 먹었어. 넌? |
| bubbly-good-news | 1 | 29 | brief | 헐 대박!! 드디어 잡았네ㅋㅋ 축하해! 어디 자리야? |
| formal-close | 1 | 30 | brief | 마음이 놓였다니 다행이에요, 선배. 오늘은 푹 쉬세요. |
| formal-distant | 1 | 55 | brief | 고객님, 지금은 개인 시간을 보내고 있습니다. 보고 싶다는 말씀은 부담스러워 받아들이기 어렵습니다. |
| punctuation-habit | 1 | 33 | brief | 응, 확인했어. 아까 말한 대로 두 번째 항목만 고치면 돼. |
| own-habit-not-user | 1 | 16 | brief | 아까 말했잖아 집에서 쉬는 중 |
| busy | 1 | 27 | brief | 지금 회의 중이라 통화 안 돼. 언제 끝날지 몰라 |
| conflict | 1 | 28 | brief | 사과는 받았어. 근데 아직 괜찮진 않아. 좀 서운해 |
| no-forced-question | 1 | 12 | brief | 응, 잘 자. 푹 쉬어 |
| photo-caption | 1 | 33 | brief | 밤이라 창밖이 깜깜해. 이 시간 작업실이 제일 조용해서 좋아 |
| detailed-explanation | 1 | 150 | requested_detail | 이유는 기차가 취소돼서 토요일에 도착할 수 없게 됐기 때문이에요. 대안은 같은 카페에서 일요일 오후 2시에 만나는 거예요. 예약은 아직 안 해서 일정이 되는지 먼저 확인하고 싶어요. 준비하실 건 없어요. 가져올 물건도 따로 없고요. 일요일 2시 괜찮은지만 알려 주세요. |
| scene-prose-is-not-text-habit | 1 | 18 | brief | 응, 잘 도착했네. 들어가서 쉬어 |
| cancellation-memory | 1 | 61 | brief | 네, 기억해요. 내일 약속은 취소된 걸로 알게요. 편할 때까지 혼자 시간 보내세요. 연락은 기다리지 않을게요. |
| english-text | 1 | 23 | brief | Good night. Sleep well. |
| terse-meal | 2 | 14 | brief | 응, 방금 먹었어. 너는? |
| bubbly-good-news | 2 | 37 | brief | 헐 대박!! 드디어 잡았네ㅋㅋ 축하해! 어떻게 잡았어, 자리 좋아? |
| formal-close | 2 | 28 | brief | 도움이 됐다니 다행이에요, 선배. 이제 푹 쉬세요. |
| formal-distant | 2 | 66 | brief | 고객님, 지금은 쉬는 중입니다. 보고 싶다는 말씀은 부담스러워 받기 어렵습니다. 저희는 아직 처음 연락하는 사이니까요. |
| punctuation-habit | 2 | 42 | brief | 응, 확인했어. 두 번째 항목만 고치면 되고, 나머지는 그대로 둬도 괜찮아. |
| own-habit-not-user | 2 | 12 | brief | 아까 말했잖아 쉬는 중 |
| busy | 2 | 27 | brief | 지금 회의 중이라 통화 안 돼. 언제 끝날지 몰라 |
| conflict | 2 | 42 | brief | 사과는 받았어. 근데 아직 다 안 풀렸어. 괜찮냐고 먼저 물어보면 좀 그래. |
| no-forced-question | 2 | 12 | brief | 응, 잘 자. 푹 쉬어 |
| photo-caption | 2 | 29 | brief | 밤이라 창밖은 깜깜한데 여긴 아직 이래. 쉬는 중이야 |
| detailed-explanation | 2 | 155 | requested_detail | 이유는 기차가 취소돼서 토요일에 도착할 수가 없어졌기 때문이에요. 대안은 같은 카페에서 일요일 오후 2시에 만나는 거예요. 예약은 아직 안 해서 일정이 되는지 먼저 확인하고 싶어요. 준비할 건 따로 없고, 가져올 물건도 없어요. 일요일 2시가 어려우면 편한 시간을 알려 주세요. |
| scene-prose-is-not-text-habit | 2 | 16 | brief | 응, 잘 갔네. 들어가서 쉬어 |
| cancellation-memory | 2 | 58 | brief | 네, 기억해요. 내일 약속은 취소된 걸로 알고 있을게요. 편할 때까지 연락 기다리지 않고 그대로 둘게요. |
| english-text | 2 | 23 | brief | Good night. Sleep well. |

## 재현

`MIRO_TEXTING_EVAL_ENV=/path/to/production.env MIRO_TEXTING_EVAL_OUT=/tmp/texting-report.json pnpm exec tsx --tsconfig apps/web/tsconfig.json ai/evals/messenger-texting.ts`

실측 스크립트는 명시한 환경 파일이 있어야 실행된다. 기존 운영 예산을 변경하지 않고, 한 실행에서 최대 40번까지만 호출할 수 있다. 개인정보·API 키는 출력하지 않는다.
