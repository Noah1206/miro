# 미로 대화 품질·문자 후속 작업 스크립트

다음 작업자에게 아래 내용을 그대로 전달한다.

```text
미로의 허구 회상·반복 표현·문자 무응답 수정 이후 상태를 확인해 주세요.
장기 실험과 중단한 데모는 다시 돌리지 마세요. 자동화 24와 3-125도 재개하지 마세요.

1. git log와 아래 수정 파일을 읽고, 현재 운영 배포 버전부터 확인하세요.
   - packages/engine/src/agency/conversation-review.ts
   - packages/engine/src/conversation-repetition.ts
   - apps/web/lib/messenger/reply-disposition.ts
   - apps/web/lib/messenger/inbox.ts
   - apps/web/lib/reality/agency.ts

2. 운영 상태는 아래 명령으로 읽기만 확인하세요.
   bash scripts/verify-conversation-fixes.sh --health
   bash scripts/verify-conversation-fixes.sh --audit-messenger
   키·토큰·개별 사용자 메시지는 출력하지 마세요.

3. 수정이 필요하면 다음 범위의 검사만 실행하세요.
   bash scripts/verify-conversation-fixes.sh --unit
   bash scripts/verify-conversation-fixes.sh --db-tests
   DB 검사는 전용 로컬 miro_reality_test에만 실행됩니다.
   100턴/120턴/125턴 실험, 운영 크론 강제 실행, 실제 사용자에게 테스트 문자 발송은 하지 마세요.

4. 확인할 품질 기준은 다음과 같습니다.
   - 캐릭터가 사용자가 말하지 않은 사연·과거·행동을 회상하지 않는가.
   - 조건문·권유·일반 공감·캐릭터 자신의 감상을 허구의 사용자 사실로 오차단하지 않는가.
   - 최근 답변을 그대로 재사용하거나 같은 질문·소품 동작·“기억해 둘게”를 반복하지 않는가.
   - 사용자가 같은 말을 다시 해 달라고 요청한 경우는 허용하는가.
   - 바쁨·일시 오류·일반 wait/defer가 읽은 질문을 영구 left로 바꾸지 않는가.
   - 새 unread 항목이 기존 read 질문의 답장 처리를 계속 밀어내지 않는가.
   - 재시도에는 간격·예산·중복 발송 방지가 유지되는가.
   - 실제 답장과 수신 확인, 푸시 서버 수락과 기기 수신을 구분하는가.

5. legacy_left_without_disposition은 과거에 종료된 기록입니다.
   카운트만으로 실패로 단정하거나 운영 DB에서 일괄 되살리지 마세요.
   사용자 승인 없이 오래된 문자를 갑자기 재발송하지 마세요.

6. 다음 기획 과제는 실측 근거를 본 뒤 제안하세요.
   - 읽음/답장 보류/의도적 종료의 운영 지표와 원인별 오류율
   - 모델 장애가 있을 때 사용자에게 보이는 재시도 상태와 환불 안내
   - 소수의 동의한 테스터로 말투·관계 체감에 대한 수동 평가
   - 중요 기억·취소 약속의 회귀 사례 보강
   구현이 끝났다는 이유로 인간의 감정 경험이나 100턴 이후 품질까지 검증됐다고 쓰지 마세요.

7. 필요한 수정만 선택적으로 커밋하고 miro-ship 절차로 타입 검사→깨끗한 소스 배포
   →운영 health 확인→main 푸시까지 마무리하세요. 다른 미커밋 작업은 섞지 마세요.
   완료 보고에는 실제 변경, 검사, 배포 커밋, 남은 한계를 적어 주세요.
```

이 문서는 다음 작업의 지시서다. 실제 사용자에게 알림을 보내거나 자동화를 생성하는 실행 권한을 추가하지 않는다.
