# Miro Design Patterns

> Miro 모바일 앱의 UI/UX를 일관되게 설계하기 위한 실무 디자인 패턴 문서  
> 대상: Designer / Frontend / Product / AI-assisted coding workflow  
> 원칙: **예쁘게 보이는 것보다, 실제 사용 상황에서 무너지지 않는 UI를 만든다.**

---

# 1. Core Design Principle

Miro는 단순한 캐릭터 채팅 앱이 아니라  
**캐릭터의 고유한 성격, 관계 상태, 시간, 사건, 세계관이 계속 변화하는 Reality Interaction 서비스**다.

따라서 UI는 다음을 우선한다.

1. 대화 몰입을 방해하지 않는다.
2. 현재 관계와 상태가 자연스럽게 드러난다.
3. 사용자가 다음 행동을 고민하지 않게 한다.
4. 작은 모바일 화면에서도 정보 우선순위가 명확해야 한다.
5. 모든 컴포넌트는 실제 서비스에서 발생하는 예외 케이스까지 고려한다.
6. 같은 기능은 항상 같은 형태와 행동을 가진다.
7. 장식보다 정보 계층과 사용성이 우선이다.

---

# 2. Mobile Layout Principles

## 2.1 큰 덩어리 중심으로 설계

모바일 화면을 지나치게 잘게 나누지 않는다.

### Good

```text
[ Character Header ]

[ Conversation ]

[ Context / Event ]

[ Message Composer ]
```

### Avoid

```text
[Character][Status][Time]
[Relationship][Event][Action]
[Chat][Info][Control]
```

한 화면에서는 사용자가 가장 중요한 행동 하나에 집중할 수 있어야 한다.

---

## 2.2 화면 정보 우선순위

기본 우선순위:

```text
Primary Action
↓
Current Conversation / Main Content
↓
Relationship / Character State
↓
Secondary Actions
↓
Metadata / Additional Information
```

Miro Chat 화면 기준:

```text
1. 현재 대화
2. 메시지 입력
3. 캐릭터 현재 상태
4. Relationship 변화
5. 이벤트 / 세계관 정보
6. 설정
```

---

# 3. Typography

## 3.1 최소 글자 크기

모바일 UI에서 중요한 텍스트는 지나치게 작게 만들지 않는다.

권장 기준:

| Type | Size |
|---|---:|
| Page Title | 24–32px |
| Section Title | 18–22px |
| Body | 15–17px |
| Button | 15–17px |
| Caption | 12–14px |
| Metadata | 최소 12px |

12px 이하의 텍스트는 특별한 이유가 없는 한 사용하지 않는다.

---

## 3.2 Typography Hierarchy

폰트 크기만으로 위계를 만들지 않는다.

다음 요소를 함께 사용한다.

- Size
- Weight
- Color
- Opacity
- Spacing

예:

```text
현재 관계        13px / Secondary
연인             20px / Bold
친밀도 84        14px / Accent
```

---

## 3.3 Miro Text Priority

### Primary

사용자가 즉시 읽어야 하는 정보.

```text
캐릭터 메시지
현재 상황
중요 이벤트
```

### Secondary

```text
Relationship Status
시간
장소
부가 설명
```

### Tertiary

```text
시스템 정보
메타데이터
보조 힌트
```

모든 텍스트가 강하면 아무것도 강조되지 않는다.

---

# 4. Accessibility

## 4.1 Contrast

일반 텍스트는 배경과 충분한 대비를 가져야 한다.

권장:

```text
Normal Text : 최소 4.5 : 1
Large Text  : 최소 3 : 1
```

라임 컬러를 사용하는 경우  
라임색을 작은 본문 텍스트에 직접 사용하는 것을 피한다.

### 권장 사용

```text
Accent
Active State
Relationship Change
CTA Highlight
Progress
```

### 피해야 할 사용

```text
긴 본문 전체
작은 Caption 전체
낮은 대비 배경 위 텍스트
```

---

## 4.2 Color Alone Rule

상태를 색상만으로 표현하지 않는다.

Bad:

```text
초록 = 온라인
회색 = 오프라인
```

Good:

```text
● 온라인
○ 오프라인
```

Relationship 변화도 동일하다.

```text
↑ 친밀도 +4
↓ 신뢰도 -2
```

색 + 아이콘 + 텍스트를 함께 사용한다.

---

# 5. Button System

Miro의 버튼은 역할에 따라 명확하게 구분한다.

---

## 5.1 Button Types

### Primary Button

가장 중요한 행동.

예:

```text
대화 시작
계속하기
캐릭터 만들기
통화 시작
```

한 화면에 Primary CTA는 원칙적으로 1개.

---

### Secondary Button

Primary보다 낮은 중요도.

```text
프로필 보기
관계 보기
설정
```

---

### Tertiary Button

작은 보조 행동.

```text
취소
닫기
나중에
더보기
```

---

### Destructive Button

```text
삭제
초기화
대화 기록 삭제
캐릭터 삭제
```

Primary CTA와 같은 스타일을 사용하지 않는다.

---

# 6. Button Size

모바일 터치 영역은 충분히 크게 만든다.

권장 최소:

```text
Height: 44px
Preferred: 48–56px
```

아이콘 버튼도 실제 시각적 아이콘 크기가 작더라도  
터치 영역은 최소 44×44px 이상으로 확보한다.

---

## 6.1 Full Width Button

다음 상황에서 사용한다.

```text
회원가입
대화 시작
결제
확인
다음 단계
```

CSS 개념:

```css
width: 100%;
```

모바일에서는 화면 양쪽 Padding을 제외한 전체 너비를 사용한다.

---

## 6.2 Hug / Auto Button

텍스트 길이에 따라 늘어나는 버튼.

사용 예:

```text
#연인
#회사
#비밀
#친구
```

구조:

```text
Text
+
Horizontal Padding
+
Vertical Padding
```

고정 Width를 사용하지 않는다.

---

# 7. Button State

모든 버튼은 최소 다음 상태를 가진다.

```text
Default
Pressed
Disabled
Loading
```

가능하면:

```text
Hover (Desktop)
Focus
Selected
```

---

## 7.1 Pressed

모바일에서 버튼을 눌렀다는 피드백이 반드시 존재해야 한다.

예:

```text
Scale: 1 → 0.97
Duration: 80–120ms
```

손가락을 놓으면:

```text
0.97 → 1
Duration: 120–180ms
```

과한 Bounce는 사용하지 않는다.

---

## 7.2 Loading

Bad:

```text
[ 대화 시작 ]
버튼 클릭
화면 멈춤
```

Good:

```text
[ ●●● ]
```

또는

```text
대화 준비 중...
```

Loading 상태에서는 중복 입력을 막는다.

---

# 8. Spacing System

화면마다 임의의 Margin 값을 만들지 않는다.

권장 spacing scale:

```text
4
8
12
16
20
24
32
40
48
64
```

주요 기준:

```text
Screen Horizontal Padding = 16–20px

Small Gap = 8px
Component Gap = 12–16px
Section Gap = 24–32px
Large Section = 40–48px
```

---

# 9. Content Grouping

Miro에서는 **정보를 많이 보여주는 것보다, 사용자가 같은 의미의 정보를 한 덩어리로 인식하게 만드는 것**이 더 중요하다.

그룹핑의 기본 원칙:

```text
같은 목적 / 같은 맥락 / 같은 행동
→ 하나의 그룹

목적 / 맥락 / 행동이 달라짐
→ 다른 그룹
```

그룹을 만들기 위해 사용할 수 있는 수단:

```text
1. Spacing
2. Typography
3. Background
4. Divider
5. Card
6. Alignment
```

우선순위는 다음과 같다.

```text
Spacing
↓
Typography
↓
Background
↓
Divider
↓
Card
```

즉, **무조건 Card로 묶지 않는다.**
가능하면 여백과 Typography만으로 먼저 그룹을 만든다.

---

## 9.1 Proximity Rule

서로 관련된 정보는 가깝게 배치하고, 관련 없는 정보는 더 멀리 떨어뜨린다.

예:

```text
캐릭터 이름
현재 상태
최근 활동
```

은 하나의 그룹으로 묶을 수 있다.

반면:

```text
캐릭터 이름
결제 설정
```

은 같은 그룹으로 묶지 않는다.

권장 간격:

```text
같은 그룹 내부: 4–12px
서로 다른 컴포넌트: 12–20px
섹션과 섹션 사이: 24–40px
```

---

## 9.2 Visual Hierarchy Inside Group

그룹 안에서도 중요도를 나눈다.

예:

```text
현재 관계       ← Label / Secondary
연인            ← Primary
친밀도 높음     ← Supporting
```

모든 텍스트를 같은 크기와 Weight로 만들지 않는다.

---

## 9.3 Relationship Grouping

Relationship 관련 정보는 한 덩어리로 인식되어야 한다.

Good:

```text
관계

연인
최근 당신에게 더 솔직해지고 있습니다.

친밀도  높음
신뢰도  높음
```

Bad:

```text
[ 관계 ]
[ 연인 ]
[ 친밀도 84 ]
[ 신뢰 72 ]
[ 최근 변화 ]
```

정보마다 Card를 생성하면 관계가 하나의 상태가 아니라  
여러 개의 독립적인 수치처럼 보이게 된다.

---

## 9.4 Conversation Grouping

Chat 화면에서는 메시지가 가장 강한 그룹이다.

구조:

```text
Character Header

Conversation Group
  Character Message
  User Message
  Reality Signal
  Character Message

Message Composer
```

`Reality Signal`은 대화에 속하지만 일반 메시지는 아니므로  
여백이나 작은 구분선으로 Sub-group 처리한다.

예:

```text
민준
"오늘은 조금 늦었네."

        "기다렸어?"

── 관계 변화 ──
민준이 당신을 조금 더 신뢰합니다.

민준
"...조금."
```

---

## 9.5 Event Grouping

하나의 사건과 그 사건에 대한 선택지는 반드시 같은 그룹으로 묶는다.

Good:

```text
갑자기 비가 내리기 시작했다.

[ 우산을 가져다준다 ]
[ 함께 비를 맞는다 ]
```

Bad:

```text
갑자기 비가 내리기 시작했다.

────────────

다른 상태 정보

────────────

[ 우산을 가져다준다 ]
```

선택지와 사건 사이에 다른 정보가 끼어들면  
사용자는 무엇에 대한 선택인지 다시 해석해야 한다.

---

## 9.6 Action Grouping

같은 목적의 버튼은 함께 배치한다.

예:

```text
[ 사진 보내기 ] [ 통화하기 ]
```

처럼 캐릭터와의 즉각적인 Interaction은 한 그룹.

반면:

```text
[ 통화하기 ]
[ 캐릭터 삭제 ]
```

는 절대 같은 그룹으로 묶지 않는다.

Destructive Action은 별도의 영역으로 분리한다.

---

## 9.7 Setting Grouping

설정 화면은 기능 기준으로 나눈다.

예:

```text
Account
- 프로필
- 로그인 정보

Conversation
- 답변 스타일
- 메시지 표시

AI
- 이미지 생성
- 음성 설정

Danger Zone
- 데이터 초기화
- 캐릭터 삭제
```

설정 항목을 단순히 긴 리스트 하나로 만들지 않는다.

---

## 9.8 Group Label

그룹 자체의 의미가 명확하다면 Label을 생략할 수 있다.

예:

```text
연인
친밀도 높음
신뢰 높음
```

만으로 충분하다면 `Relationship` 제목을 추가하지 않아도 된다.

반대로 여러 그룹이 연속된다면 Label을 사용한다.

```text
관계
최근 사건
기억
```

---

## 9.9 Card Usage Rule

Card는 다음 경우에 사용한다.

```text
하나의 독립적인 정보 단위
사용자가 따로 인식해야 하는 상태
클릭 가능한 하나의 객체
```

예:

```text
Character Card
Event Card
Memory Card
Subscription Card
```

Card를 사용하지 않는 것이 좋은 경우:

```text
텍스트 한 줄
단순 Label
작은 상태값
버튼 한 개
모든 Chat Message
```

Miro에서 Card가 너무 많으면  
현실적인 관계 인터랙션보다 Dashboard / Game UI처럼 느껴질 수 있다.

---

## 9.10 Divider Rule

Divider는 정말 다른 그룹이라는 것을 보여줘야 할 때만 사용한다.

Bad:

```text
텍스트
────────
텍스트
────────
텍스트
────────
텍스트
```

Good:

```text
관계 정보

최근 변화

────────

캐릭터 설정
```

여백만으로 구분 가능한 경우 Divider를 추가하지 않는다.

---

## 9.11 Background Grouping

강한 그룹 분리가 필요한 경우 배경색을 사용할 수 있다.

예:

```text
Conversation
→ Main Background

Relationship Detail
→ Slightly Elevated Surface

Danger Zone
→ Separate Surface
```

Background를 바꾸는 것은 강한 그룹핑이므로 남용하지 않는다.

---

## 9.12 Grouping Priority for Miro

Miro에서 화면을 그룹핑할 때 다음 순서로 판단한다.

```text
1. 이것들이 같은 맥락인가?
2. 같은 행동과 연결되는가?
3. 사용자가 한 번에 같이 이해해야 하는가?
4. 여백만으로 구분 가능한가?
5. Typography로 충분한가?
6. 그래도 부족하면 Divider / Background / Card를 사용한다.
```

---

## 9.13 Grouping QA Checklist

- [ ] 서로 관련된 정보가 가까이 있는가?
- [ ] 관련 없는 정보가 충분히 떨어져 있는가?
- [ ] 하나의 그룹 안에서 Primary / Secondary가 구분되는가?
- [ ] Card를 불필요하게 많이 사용하지 않았는가?
- [ ] Divider가 너무 많지 않은가?
- [ ] 버튼이 기능 목적에 맞게 묶여 있는가?
- [ ] Event와 선택지가 같은 그룹인가?
- [ ] Relationship 정보가 하나의 상태처럼 보이는가?
- [ ] Destructive Action이 일반 Action과 분리되어 있는가?
- [ ] 화면을 3초 봤을 때 정보 덩어리가 자연스럽게 보이는가?

---

# 10. Card Pattern

카드는 정보 그룹핑이 필요한 경우에만 사용한다.

### Good

```text
Relationship
Event
Character Memory
World State
```

### Avoid

```text
모든 텍스트
모든 버튼
모든 메시지
```

카드가 너무 많으면 화면이 대시보드처럼 보이고  
Reality Interaction의 몰입감이 깨진다.

---

# 11. Icon System

아이콘 스타일은 반드시 통일한다.

하나의 Icon Set에서 사용한다.

통일 기준:

```text
Stroke Width
Corner Style
Optical Size
Fill / Outline
ViewBox
```

예:

```text
Lucide
Phosphor
SF Symbols
Material Symbols
```

여러 세트를 섞지 않는다.

---

## 11.1 Icon + Label

익숙하지 않은 기능은 반드시 텍스트를 같이 제공한다.

Bad:

```text
◈
```

Good:

```text
◈ 관계
```

예외:

```text
뒤로가기
닫기
더보기
검색
```

일반적으로 인지도가 높은 아이콘은 단독 사용 가능하다.

---

# 12. Bottom Navigation

하단 Navigation은 최대 5개.

Miro 권장:

```text
Home
Chat
Create
Activity
Profile
```

가능하면 핵심 탭은 3–5개 안에서 유지한다.

6개 이상이 필요하면:

```text
More
Profile
Secondary Screen
```

등으로 이동한다.

---

# 13. Text Overflow

실제 서비스에서는 모든 텍스트 길이가 다르다.

항상 다음 케이스를 확인한다.

```text
Short
Normal
Long
Very Long
2 Lines
3 Lines
```

예:

```text
김민준
알렉산더 세바스찬 폰 슈타인
```

버튼:

```text
확인

캐릭터와 새로운 관계를 시작하기
```

---

## 13.1 Dynamic Character Text

AI가 생성하는 텍스트는 길이를 예측할 수 없다.

따라서:

```text
Fixed Height 사용 금지
```

가능하면:

```text
min-height
auto height
max-height + scroll
```

을 사용한다.

---

# 14. Character Chat Pattern

Miro의 핵심 화면.

우선순위:

```text
Character
↓
Conversation
↓
Reality Signal
↓
Input
```

---

## 14.1 Character Message

메시지 Bubble은 지나치게 카드처럼 만들지 않는다.

텍스트 읽기에 집중한다.

권장:

```text
max-width: 75–85%
```

긴 문장은 자연스럽게 줄바꿈한다.

---

## 14.2 Reality Signal

관계 또는 상태 변화는 대화를 방해하지 않게 작게 표시한다.

예:

```text
── 관계 변화 ──
신뢰 +3
```

또는

```text
민준이 당신을 조금 더 신뢰하기 시작했습니다.
```

이 요소는 채팅 메시지보다 시각적 강도가 낮아야 한다.

---

# 15. Relationship UI

Relationship은 숫자만 보여주는 게임 UI처럼 만들지 않는다.

Bad:

```text
Love 82
Trust 73
Affinity 91
```

Good:

```text
현재 관계
연인

당신에게 상당히 마음을 연 상태입니다.

친밀도  ████████░░
신뢰도  ███████░░░
```

숫자는 보조 정보이며  
관계 해석이 Primary 정보다.

---

# 16. Event UI

이벤트는 대화 흐름 안에서 자연스럽게 발생해야 한다.

예:

```text
밤 11:42

밖에서 갑자기 비가 내리기 시작했다.

[우산을 가져다준다]
[그냥 기다린다]
```

선택지는 너무 많은 수를 동시에 제공하지 않는다.

권장:

```text
2–4 options
```

---

# 17. Bottom Sheet

다음 기능은 Bottom Sheet를 우선 고려한다.

```text
Relationship Detail
Character Action
Report
Share
Quick Settings
Voice Option
Image Generation Option
```

사용자가 현재 컨텍스트를 잃지 않게 하기 위함이다.

---

## 17.1 Bottom Sheet Structure

```text
Drag Handle

Title
Description

Content

Primary Action
```

높이가 길면 내부 Scroll을 사용한다.

---

# 18. Full Case Design

모든 컴포넌트는 아래 케이스를 디자인해야 한다.

```text
Empty
Loading
Success
Error
Disabled
Long Text
Small Screen
Large Screen
Offline
Slow Network
```

---

# 19. Empty State

Bad:

```text
데이터 없음
```

Good:

```text
아직 새로운 사건이 없습니다.

캐릭터와 대화를 이어가면
새로운 사건이 발생할 수 있습니다.
```

필요하면 CTA 제공:

```text
[ 대화 계속하기 ]
```

---

# 20. Error State

Error는 기술적인 메시지를 그대로 노출하지 않는다.

Bad:

```text
HTTP 500
AI_PROVIDER_TIMEOUT
```

Good:

```text
응답을 불러오지 못했습니다.

[ 다시 시도 ]
```

필요하면:

```text
잠시 후 다시 시도해주세요.
```

---

# 21. AI Response State

AI 기능은 반드시 다음 상태를 디자인한다.

```text
Generating
Streaming
Completed
Failed
Retry
```

---

## 21.1 Streaming

Miro에서는 Streaming response를 적극 사용한다.

사용자가 캐릭터가 실제로 답하고 있다는 느낌을 받을 수 있다.

하지만 지나치게 느린 Typewriter Animation은 금지한다.

---

# 22. White / Light Content Edge Case

이미지, 프로필, 컬러칩처럼  
배경과 색상이 겹칠 수 있는 요소는 Stroke를 고려한다.

예:

```text
1px rgba(0,0,0,0.08)
```

Dark Mode:

```text
1px rgba(255,255,255,0.08)
```

특히:

```text
Avatar
Image Thumbnail
Color Picker
Character Generated Image
```

에 적용한다.

---

# 23. Generated Image UI

AI 생성 이미지에는 다음 상태를 고려한다.

```text
Loading
Generated
Failed
Regenerate
Save
Share
```

이미지가 밝거나 어두울 수 있기 때문에  
오버레이 아이콘은 배경 이미지에 직접 의존하지 않는다.

예:

```text
semi-transparent background
blur
stroke
```

사용.

---

# 24. Filter / Selector Pattern

캐릭터 생성이나 탐색 필터에 사용.

필터는 선택된 값을 항상 보여준다.

Bad:

```text
필터
```

Good:

```text
필터 · 3
```

또는

```text
성격: 냉정함 ×
관계: 직장 ×
나이: 20대 ×
```

---

## 24.1 Reset

여러 Filter가 존재하면:

```text
전체 초기화
```

기능을 제공한다.

---

# 25. Responsive Rules

모바일 우선.

기준:

```text
320px
360px
390px
430px
```

모든 화면은 최소 320px에서 깨지지 않아야 한다.

---

## 25.1 Fixed Width 금지 대상

다음 요소는 가능하면 고정 width를 사용하지 않는다.

```text
Text Card
Chat Bubble
Profile Information
Relationship Card
Event Description
```

---

# 26. Component Variants

컴포넌트는 복사해서 새로 만들지 않는다.

Variant 기반으로 관리한다.

예:

```text
Button

variant:
- primary
- secondary
- tertiary
- danger

size:
- sm
- md
- lg

state:
- default
- pressed
- disabled
- loading
```

---

# 27. Auto Layout Principle

Figma에서는 대부분 Auto Layout을 사용한다.

특히:

```text
Buttons
Cards
List
Chat Bubble
Tags
Navigation
Bottom Sheet
```

---

## 27.1 Hug

콘텐츠 길이에 따라 크기가 달라지는 UI.

```text
Tag
Chip
Small Button
Badge
```

---

## 27.2 Fill

부모 영역을 채워야 하는 UI.

```text
Primary CTA
Input
Card
List Item
```

---

## 27.3 Fixed

실제 이유가 있을 때만 사용한다.

```text
Icon
Avatar
Navigation Height
Button Height
```

---

# 28. Interaction Feedback

사용자의 모든 행동에는 반응이 있어야 한다.

```text
Tap
Press
Long Press
Swipe
Loading
Success
Failure
```

---

## 28.1 Long Press

Miro Chat:

```text
Message Long Press
```

가능 기능:

```text
Copy
Retry
Delete
Report
Save Memory
```

Bottom Sheet 또는 Context Menu를 사용한다.

---

# 29. Animation

애니메이션 목적:

```text
State Change 설명
Hierarchy 표현
Feedback 제공
Context 유지
```

장식용 Animation은 최소화한다.

---

## 29.1 Recommended Duration

```text
Micro Interaction
80–180ms

Component Transition
180–280ms

Page Transition
220–350ms
```

---

# 30. Miro Motion Style

Miro의 애니메이션은:

```text
Soft
Fast
Responsive
Subtle
```

이어야 한다.

피해야 할 것:

```text
Excessive Bounce
Slow Fade
Long Delay
Heavy Parallax
```

---

# 31. Design QA Checklist

화면 완성 후 반드시 확인한다.

## Typography

- [ ] 본문 글자 크기가 너무 작지 않은가?
- [ ] 정보 중요도가 Typography로 표현되는가?
- [ ] Secondary Text가 지나치게 흐리지 않은가?

## Button

- [ ] 최소 44px Touch Target인가?
- [ ] Primary CTA가 명확한가?
- [ ] Pressed State가 존재하는가?
- [ ] Loading State가 존재하는가?
- [ ] Disabled State가 존재하는가?

## Layout

- [ ] 화면이 너무 잘게 나뉘지 않았는가?
- [ ] Section 간 여백이 충분한가?
- [ ] 같은 의미의 UI가 같은 구조를 사용하는가?

## Accessibility

- [ ] Contrast가 충분한가?
- [ ] 색상만으로 상태를 구분하지 않는가?
- [ ] Icon에 필요한 Label이 존재하는가?

## Dynamic Content

- [ ] 긴 이름이 들어가도 깨지지 않는가?
- [ ] 텍스트가 두 줄 이상이어도 문제없는가?
- [ ] AI 응답이 길어져도 UI가 유지되는가?

## AI State

- [ ] Generating
- [ ] Streaming
- [ ] Error
- [ ] Retry
- [ ] Offline

## Images

- [ ] 밝은 이미지에서 Control이 보이는가?
- [ ] 어두운 이미지에서도 Control이 보이는가?
- [ ] Image Loading State가 존재하는가?

---

# 32. Miro Screen Rule

모든 Miro 화면은 아래 질문에 답할 수 있어야 한다.

```text
1. 지금 어디인가?
2. 지금 어떤 상태인가?
3. 가장 중요한 정보는 무엇인가?
4. 지금 무엇을 할 수 있는가?
5. 다음 행동은 무엇인가?
```

3초 안에 답할 수 없다면  
정보 계층을 다시 설계한다.

---

# 33. Reality Interaction Rule

Miro의 UI는 게임의 Status Dashboard처럼 보이는 것을 피한다.

Relationship / World State / Event State는 존재하지만  
사용자에게 모든 내부 값을 노출할 필요는 없다.

예:

Bad

```text
Trust: 72
Love: 84
Fear: 12
Jealousy: 38
```

Better

```text
관계
연인

최근 당신에게 더 솔직해지고 있습니다.

친밀도 높음
신뢰 높음
```

필요한 경우 상세 화면에서 수치 정보를 제공한다.

---

# 34. Final Principle

Miro 디자인에서 가장 중요한 기준:

> **예쁜 화면을 만드는 것이 아니라  
> 캐릭터와 관계가 실제로 존재하는 것처럼 느끼게 만드는 화면을 만든다.**

따라서 모든 UI 결정은 다음 순서로 판단한다.

```text
Usability
↓
Clarity
↓
Consistency
↓
Accessibility
↓
Immersion
↓
Visual Decoration
```

Visual Decoration은 항상 마지막이다.
