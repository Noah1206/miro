# 텔레그램 입금 확인

유저는 충전 상품을 골라 계좌이체한 뒤 `입금 확인 요청`을 누른다. 요청은 DB에 저장한 다음 운영자의 미로 전용 봇으로 알림을 보낸다. 동일 요청의 네트워크 재시도는 중복 발송하지 않으며, 새로운 버튼 클릭은 새로운 알림을 만든다.

알림에는 금액, 토큰 수량, 입금자명·대조 코드, 주문 ID와 `입금 확인 · 승인` 버튼이 담긴다. 운영자는 은행 거래내역을 확인한 뒤 승인한다. 텔레그램이 실제 은행 입금을 자동 감지하는 것은 아니다.

## 설정

- `MIRO_TELEGRAM_BOT_TOKEN`: 미로 전용 BotFather 봇 토큰
- `MIRO_TELEGRAM_CHAT_ID`: 운영자 개인 대화 ID
- `MIRO_TELEGRAM_APPROVER_ID`: 승인 가능한 본인 텔레그램 사용자 ID
- `MIRO_TELEGRAM_ADMIN_ID`: 활성 상태인 미로 superadmin의 UUID
- `MIRO_TELEGRAM_WEBHOOK_SECRET`: Telegram `setWebhook`의 `secret_token`과 동일한 값

웹훅 URL은 `https://miroapp.app/api/telegram/payments`, allowed_updates는 callback_query로 설정한다. 기존 다른 서비스 봇의 웹훅을 바꾸지 않는다. 키는 저장소·로그에 남기지 않는다.

배포 전에 `packages/db/migrations/20261014010000_bank_telegram_requests.sql`을 적용한다.

## 동작 보장

- 요청자 소유의 입금 대기 주문만 알림을 요청할 수 있다.
- Telegram 전송 실패 시 DB 요청을 유지하고 유지보수 크론에서 재시도한다. Telegram 장애 시 즉시 수신까지 보장할 수는 없으며 앱에는 재전송 중임을 표시한다.
- 웹훅 시크릿, 승인자 사용자 ID, 개인 채팅 ID를 모두 검사한다. superadmin이 비활성화되면 승인하지 않는다.
- 승인·감사 로그·토큰 지급·주문 완료를 같은 DB 트랜잭션에서 처리한다. 중복 클릭·동시 승인·기존 크론은 충전 원장의 같은 거래 키를 사용하므로 한 번만 지급한다.
- 실제 주문의 승인은 사람이 직접 입금을 확인한 뒤 누른다. 자동 검증은 격리된 로컬 테스트 DB와 모의 Telegram API를 사용한다.

공식 API: https://core.telegram.org/bots/api
