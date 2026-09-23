import { sql } from 'drizzle-orm'
import {
  bigserial, boolean, index, integer, jsonb, numeric, pgTable, text, timestamp, uniqueIndex, uuid,
} from 'drizzle-orm/pg-core'
import type { BaseFace, BodyProfile, HairProfile } from '@miro/domain'

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  /** 소셜 제공자가 이메일을 주지 않을 수 있다 (카카오·네이버 선택 동의). 있으면 계정 연결 키로 쓴다. */
  email: text('email').unique(),
  displayName: text('display_name'),
  allowTraining: boolean('allow_training').notNull().default(false),
  allowEvaluation: boolean('allow_evaluation').notNull().default(false),
  aiConsentVersion: text('ai_consent_version'),
  aiConsentAt: timestamp('ai_consent_at', { withTimezone: true }),
  /** 로그인 없이 시작한 체험 계정(Closed Alpha). 이메일이 없고, 나중에 소셜 로그인으로 이어붙일 수 있다. */
  isGuest: boolean('is_guest').notNull().default(false),

  /** Free/Pro 자격. 결제(Phase 13) 이전에는 dev 토글/Admin 이 이 값을 쓴다. */
  plan: text('plan', { enum: ['free', 'pro'] }).notNull().default('free'),

  adultVerifiedAt: timestamp('adult_verified_at', { withTimezone: true }),
  adultVerifyFailedAt: timestamp('adult_verify_failed_at', { withTimezone: true }),
  /** 성인 콘텐츠 사용 정책 동의. 인증과 별개로 요구된다 (명세서 정책 2). */
  maturePolicyAgreedAt: timestamp('mature_policy_agreed_at', { withTimezone: true }),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  /** 계정 삭제 후 동일 계정 로그인 및 보관함 접근 차단 (명세서 12.1). */
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
})

export const accounts = pgTable('accounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  provider: text('provider').notNull(),
  providerAccountId: text('provider_account_id').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  providerIdx: index('accounts_provider_idx').on(t.provider, t.providerAccountId),
}))

export const authSessions = pgTable('auth_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  token: text('token').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
}, (t) => ({ userIdx: index('auth_sessions_user_idx').on(t.userId) }))

export const termsConsents = pgTable('terms_consents', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  termsVersion: text('terms_version').notNull(),
  privacyVersion: text('privacy_version').notNull(),
  agreedAt: timestamp('agreed_at', { withTimezone: true }).notNull().defaultNow(),
})

/** 알림·통화·야간 연락 설정. Reality Activation 이 발송 전 반드시 참조한다. */
export const userSettings = pgTable('user_settings', {
  userId: uuid('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  pushEnabled: boolean('push_enabled').notNull().default(true),
  voiceCallEnabled: boolean('voice_call_enabled').notNull().default(true),
  videoCallEnabled: boolean('video_call_enabled').notNull().default(true),
  /** 명세서 5.1: 야간 선연락은 기본 차단, 사용자가 끌 수 있다. */
  quietHoursEnabled: boolean('quiet_hours_enabled').notNull().default(true),
  quietHoursStart: text('quiet_hours_start').notNull().default('23:00'),
  quietHoursEnd: text('quiet_hours_end').notNull().default('08:00'),
  /** Quiet Hours / Active Hours 는 사용자 현지 시각 기준이다. */
  timeZone: text('time_zone').notNull().default('Asia/Seoul'),
  /** 기기 권한은 명시적 동의 후에만 사용한다 (명세서 7.1). 동의 시각을 남긴다. */
  cameraConsentAt: timestamp('camera_consent_at', { withTimezone: true }),
  micConsentAt: timestamp('mic_consent_at', { withTimezone: true }),
  imageUploadConsentAt: timestamp('image_upload_consent_at', { withTimezone: true }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

/** Web Push 구독. 기기마다 하나이며 endpoint 로 식별한다. */
export const pushSubscriptions = pgTable('push_subscriptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  endpoint: text('endpoint').notNull().unique(),
  p256dh: text('p256dh').notNull(),
  auth: text('auth').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  /** 발송 실패(410 등) 시 기록. 반복 실패 구독은 정리 대상. */
  failedAt: timestamp('failed_at', { withTimezone: true }),
}, (t) => ({ userIdx: index('push_subscriptions_user_idx').on(t.userId) }))

/**
 * Character Core — 안정적으로 유지되는 정체성.
 * Dynamic State(감정/관계/세계 위치)는 여기 저장하지 않는다.
 */
export const characters = pgTable('characters', {
  id: uuid('id').primaryKey().defaultRandom(),
  /** null = 공식 캐릭터 (토마스/강태윤/히사시) */
  ownerId: uuid('owner_id').references(() => users.id, { onDelete: 'cascade' }),
  isOfficial: boolean('is_official').notNull().default(false),

  /** 공식 캐릭터 식별용 안정 키. 재시드 시 중복 생성을 막는다. */
  slug: text('slug').unique(),

  name: text('name').notNull(),
  /** 자유 텍스트 — 숫자만이 아니라 '추정불가', '1000' 같은 값도 그대로 담는다. */
  age: text('age'),
  nationality: text('nationality'),
  occupation: text('occupation'),
  mbti: text('mbti'),

  personality: text('personality').notNull(),
  values: text('values'),
  speechStyle: text('speech_style'),
  userNickname: text('user_nickname'),
  hobbies: jsonb('hobbies').$type<string[]>().notNull().default([]),
  dislikes: jsonb('dislikes').$type<string[]>().notNull().default([]),

  /** 0-100. 같은 사용자 행동에도 캐릭터마다 다른 반응을 만드는 성향값. */
  jealousy: integer('jealousy').notNull().default(50),
  initiative: integer('initiative').notNull().default(50),
  emotionalExpression: integer('emotional_expression').notNull().default(50),

  socialPosition: text('social_position'),
  startingContext: text('starting_context'),

  /** 카드/상세 화면 표시용. 긴 설정집을 강제하지 않는다 (명세서 2.1). */
  role: text('role'),
  /** 카드에 얹는 한 줄. 캐릭터가 직접 하는 말이다 — 서술문인 startingContext 와 다르다. */
  tagline: text('tagline'),
  /**
   * 상세의 '상황 예시' — 이 캐릭터와의 대화가 어떤 느낌인지 보여주는 짧은 주고받음.
   * 실제 역할극이 아니라 소개용 샘플이라 세션과 무관하게 캐릭터에 붙는다.
   */
  sampleDialogue: jsonb('sample_dialogue').$type<Array<{ role: 'character' | 'user' | 'narrator'; text: string }>>().notNull().default([]),
  /** 로어북 — 유저 입력에 키워드가 뜨면 그 항목만 프롬프트에 실린다. */
  lore: jsonb('lore').$type<Array<{ keywords: string[]; content: string }>>().notNull().default([]),
  relationshipKeywords: jsonb('relationship_keywords').$type<string[]>().notNull().default([]),
  /** 대표 사진(첫 번째)과 추가 사진. Supabase Storage 의 공개 URL. */
  images: jsonb('images').$type<string[]>().notNull().default([]),
  accentA: text('accent_a'),
  accentB: text('accent_b'),

  /**
   * 시작 관계. 캐릭터마다 다른 출발점을 갖는다 (태윤=professional, 히사시=보호성향 높음).
   * 세션 생성 시 relationships 행의 초기값으로 복사된다.
   */
  initialRelationship: jsonb('initial_relationship')
    .$type<Record<string, number | string>>().notNull().default({}),

  /** 시작 시각 표현. 세션의 최초 world_state 에 복사된다. */
  startingTime: text('starting_time').notNull().default('저녁'),

  /** Quick Create 초안 자동 임시저장 (명세서 2.2 예외). */
  isDraft: boolean('is_draft').notNull().default(false),
  /** 다른 사람에게 보이는가. 공식이 아닌 캐릭터는 이 값이 켜져야 홈·검색·상세에 노출된다. 초안은 절대 공개되지 않는다. */
  isPublic: boolean('is_public').notNull().default(false),

  /**
   * 경험 유형. `chat` 은 홈의 일반 캐릭터챗 — 말투·기억·관계는 이어지지만 먼저 연락하지 않는다.
   * `reality` 는 미로 전용 — 대화·관계·시간을 근거로 선연락과 사진·통화가 열린다.
   *
   * 유형은 캐릭터 한 곳에서만 정한다. 세션은 characterId 를 따라가고, 폼·URL 로는 바꿀 수 없다.
   * isOfficial(제작 주체)이나 contact_profiles.enabled(연락 스위치)로 대신하지 않는다 —
   * 둘 다 기본값이 기존 캐릭터를 잘못 편입시킨다. 지정은 운영 콘솔에서만 한다.
   */
  experienceType: text('experience_type', { enum: ['chat', 'reality'] }).notNull().default('chat'),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
}, (t) => ({
  ownerIdx: index('characters_owner_idx').on(t.ownerId),
  officialIdx: index('characters_official_idx').on(t.isOfficial),
  publicIdx: index('characters_public_idx').on(t.isPublic),
  experienceIdx: index('characters_experience_idx').on(t.experienceType),
  visibleRecentIdx: index('characters_visible_recent_idx').on(t.createdAt.desc(), t.id.desc())
    .where(sql`${t.deletedAt} IS NULL AND ${t.isDraft} = false`),
}))

/**
 * Visual Identity — Profile / AI Photo / Dynamic Scene / Live Scene / Video Call
 * 전부가 동일한 이 레코드를 기준으로 삼는다. 기능마다 다른 외형을 만들지 않는다.
 */
export const characterVisualIdentities = pgTable('character_visual_identities', {
  id: uuid('id').primaryKey().defaultRandom(),
  characterId: uuid('character_id').notNull().references(() => characters.id, { onDelete: 'cascade' }),
  version: integer('version').notNull().default(1),

  baseFace: jsonb('base_face').$type<Partial<BaseFace>>().notNull().default({}),
  bodyProfile: jsonb('body_profile').$type<Partial<BodyProfile>>().notNull().default({}),
  hair: jsonb('hair').$type<Partial<HairProfile>>().notNull().default({}),
  styleTags: jsonb('style_tags').$type<string[]>().notNull().default([]),
  expressionTendency: text('expression_tendency'),
  outfitProfile: jsonb('outfit_profile').$type<Record<string, unknown>>().notNull().default({}),

  referenceSource: text('reference_source', {
    enum: ['text', 'ai_generated', 'user_upload', 'reference_image'],
  }).notNull().default('text'),
  /** 실존 인물 기반 성적 비주얼 제한 판정에 사용 (명세서 정책 2). */
  hasRealPersonReference: boolean('has_real_person_reference').notNull().default(false),

  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ charIdx: index('cvi_character_idx').on(t.characterId) }))

/** Contact Style — 선연락 판단의 캐릭터별 baseline. */
export const contactProfiles = pgTable('contact_profiles', {
  id: uuid('id').primaryKey().defaultRandom(),
  characterId: uuid('character_id').notNull().unique()
    .references(() => characters.id, { onDelete: 'cascade' }),

  /**
   * 앱 밖에서 먼저 연락하는 기능 자체의 on/off. 빈도 0 은 '3일에 한 번' 이지 '안 함' 이 아니라서
   * 별도 스위치가 필요하다 — 사용자가 끄면 사건이 있어도 연락하지 않는다.
   */
  enabled: boolean('enabled').notNull().default(true),

  contactFrequency: integer('contact_frequency').notNull().default(50),
  replyDelayMinutes: integer('reply_delay_minutes').notNull().default(5),
  preferredChannel: text('preferred_channel').notNull().default('message'),
  callProbability: integer('call_probability').notNull().default(30),
  videoCallProbability: integer('video_call_probability').notNull().default(10),
  photoProbability: integer('photo_probability').notNull().default(20),
  voiceMessageProbability: integer('voice_message_probability').notNull().default(20),
  activeHoursStart: text('active_hours_start').notNull().default('08:00'),
  activeHoursEnd: text('active_hours_end').notNull().default('23:00'),
  initiativeLevel: integer('initiative_level').notNull().default(50),

  /**
   * World Translation — 같은 기능도 세계관에 맞게 다르게 보인다 (명세서 5.1).
   * 예: 히사시는 '알 수 없는 번호', 토마스는 '편지'. 코드 분기가 아니라 데이터다.
   */
  presentation: jsonb('presentation').$type<{
    senderLabel?: string
    channelLabels?: Record<string, string>
  }>().notNull().default({}),
})

export const worlds = pgTable('worlds', {
  id: uuid('id').primaryKey().defaultRandom(),
  characterId: uuid('character_id').notNull().references(() => characters.id, { onDelete: 'cascade' }),
  era: text('era'),
  location: text('location'),
  genre: text('genre'),
  worldSetting: text('world_setting'),
})

/**
 * Roleplay Session — Simulation 의 컨테이너.
 * 같은 캐릭터라도 사용자마다 별도 세션이므로 서로 다른 관계가 형성된다 (지시서 §0-D).
 */
export const roleplaySessions = pgTable('roleplay_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  characterId: uuid('character_id').notNull().references(() => characters.id, { onDelete: 'cascade' }),
  worldId: uuid('world_id').notNull().references(() => worlds.id),

  /**
   * Legacy (2026-09-18 폐지, 명세서 §3). 출력 스타일은 이제 엔진이 인터랙션·맥락으로
   * 턴마다 결정한다 (`packages/engine/src/context.ts` styleDirective). 이 컬럼은 읽지도
   * 쓰지도 않으며, 파괴적 마이그레이션을 피하기 위해 남겨 둔다.
   */
  outputStyle: text('output_style', { enum: ['messenger', 'balanced', 'narrative'] })
    .notNull().default('balanced'),

  /** Event cooldown 계산의 기준. 스토리 진행 트리거로는 사용하지 않는다. */
  turnCount: integer('turn_count').notNull().default(0),

  status: text('status', { enum: ['active', 'archived'] }).notNull().default('active'),
  lastInteractionAt: timestamp('last_interaction_at', { withTimezone: true }).notNull().defaultNow(),

  /** RP 턴에서 AI 가 제안한 "나중에 연락하고 싶은 이유". 스케줄러가 우선 참고한다. */
  pendingRealityIntent: jsonb('pending_reality_intent')
    .$type<{ channel: string; reason: string; urgency: number; notBefore?: string }>(),
  /** 턴마다 변하는 캐릭터 상태(기분·스트레스·목표·발동한 규칙). 프로필(characters)과 분리한다. */
  characterState: jsonb('character_state').$type<Record<string, unknown>>().notNull().default({}),
  /** 스케줄러가 마지막으로 이 세션의 선연락을 판단한 시각. */
  realityCheckedAt: timestamp('reality_checked_at', { withTimezone: true }),
  /** 캐릭터 상태 한 줄 ('status' 채널). Chats 목록과 헤더에 표시. */
  characterStatus: text('character_status'),
  /** 운영 제한 조치. 설정되면 새 턴/미디어 생성을 거부한다 (명세서 9.2). */
  restrictedAt: timestamp('restricted_at', { withTimezone: true }),
  restrictedReason: text('restricted_reason'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  /** 삭제 확정 후 일정 기간 복구 가능하게 보관 (명세서 8.1 결과). */
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
}, (t) => ({
  userIdx: index('sessions_user_idx').on(t.userId, t.status),
  lastIdx: index('sessions_last_interaction_idx').on(t.lastInteractionAt),
}))

/**
 * World State — 턴마다 초기화되지 않는다.
 * Chat / Photo / Call / Background / Reality 가 전부 이 하나를 참조한다.
 */
export const worldStates = pgTable('world_states', {
  id: uuid('id').primaryKey().defaultRandom(),
  sessionId: uuid('session_id').notNull().unique()
    .references(() => roleplaySessions.id, { onDelete: 'cascade' }),
  /** optimistic lock. 동시 RP 요청이 이전 상태를 덮어쓰는 것을 막는다. */
  version: integer('version').notNull().default(1),

  currentLocation: text('current_location').notNull(),
  currentTime: text('current_time').notNull(),
  currentSceneId: uuid('current_scene_id'),
  worldStatus: text('world_status'),
  activeEventIds: jsonb('active_event_ids').$type<string[]>().notNull().default([]),
  activeNpcIds: jsonb('active_npc_ids').$type<string[]>().notNull().default([]),
  unresolvedWorldEvents: jsonb('unresolved_world_events').$type<string[]>().notNull().default([]),

  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

/**
 * Relationship State — 다차원. 선형 Progress Bar 가 아니며 후퇴할 수 있다.
 * 모든 수치는 내부용이며 UI 에 노출하지 않는다 (명세서 4장 수용기준 4).
 */
export const relationships = pgTable('relationships', {
  id: uuid('id').primaryKey().defaultRandom(),
  sessionId: uuid('session_id').notNull().unique()
    .references(() => roleplaySessions.id, { onDelete: 'cascade' }),
  version: integer('version').notNull().default(1),

  trust: integer('trust').notNull().default(30),
  attraction: integer('attraction').notNull().default(10),
  jealousy: integer('jealousy').notNull().default(0),
  protectiveness: integer('protectiveness').notNull().default(20),
  emotionalDistance: integer('emotional_distance').notNull().default(60),
  attachment: integer('attachment').notNull().default(10),

  /** 관계를 설명하는 Semantic State. 기능 unlock 조건으로 쓰지 않는다. */
  stage: text('stage', {
    enum: ['stranger', 'acquaintance', 'professional', 'friend', 'rivalry',
           'distrust', 'ambiguous', 'conflict', 'flirting', 'dating', 'lover'],
  }).notNull().default('stranger'),

  unresolvedEventIds: jsonb('unresolved_event_ids').$type<string[]>().notNull().default([]),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const messages = pgTable('messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  sessionId: uuid('session_id').notNull().references(() => roleplaySessions.id, { onDelete: 'cascade' }),
  role: text('role', { enum: ['user', 'character', 'narrator', 'npc', 'system'] }).notNull(),
  kind: text('kind', {
    enum: ['text', 'photo', 'voice_message', 'event_card', 'call_record', 'live_scene', 'reality_message'],
  }).notNull().default('text'),

  content: text('content').notNull(),
  /** dialogue / action / narrative / npc / world 블록. 자유 RP 출력의 구조. */
  blocks: jsonb('blocks').$type<Array<Record<string, unknown>>>().notNull().default([]),
  mediaId: uuid('media_id'),
  turnIndex: integer('turn_index').notNull(),
  /** 운영 조치로 숨김. 원문은 검토용으로 남고 사용자에게는 표시하지 않는다. */
  hiddenAt: timestamp('hidden_at', { withTimezone: true }),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  // 한 턴에 캐릭터/NPC/서술 메시지가 여러 개 나올 수 있으므로 unique 제약을 두지 않는다.
  sessionIdx: index('messages_session_idx').on(t.sessionId, t.turnIndex),
  archivePreviewIdx: index('messages_archive_preview_idx')
    .on(t.sessionId, t.createdAt.desc(), t.id.desc())
    .where(sql`${t.hiddenAt} IS NULL`),
}))


/* ─────────────── Simulation state (M2) ─────────────── */

export const events = pgTable('events', {
  id: uuid('id').primaryKey().defaultRandom(),
  sessionId: uuid('session_id').notNull()
    .references(() => roleplaySessions.id, { onDelete: 'cascade' }),

  type: text('type').notNull(),
  status: text('status', {
    enum: ['created', 'active', 'escalated', 'resolved', 'expired', 'cancelled'],
  }).notNull().default('active'),

  context: jsonb('context').$type<Record<string, unknown>>().notNull().default({}),
  participantNpcIds: jsonb('participant_npc_ids').$type<string[]>().notNull().default([]),
  /** 사건이 남긴 지속 상태. 다음 턴에 이유 없이 사라지지 않게 하는 근거. */
  continuationState: jsonb('continuation_state').$type<Record<string, unknown>>().notNull().default({}),
  consequences: jsonb('consequences').$type<string[]>().notNull().default([]),

  /** 이 턴 이전에는 동일 유형이 재발생할 수 없다. */
  cooldownUntilTurn: integer('cooldown_until_turn').notNull().default(0),
  createdAtTurn: integer('created_at_turn').notNull(),
  resolvedAtTurn: integer('resolved_at_turn'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  sessionIdx: index('events_session_status_idx').on(t.sessionId, t.status),
  resolvedRecentIdx: index('events_resolved_recent_idx')
    .on(t.sessionId, t.resolvedAtTurn.desc().nullsLast(), t.id.desc())
    .where(sql`${t.status} = 'resolved'`),
  resolvedCooldownIdx: index('events_resolved_cooldown_idx')
    .on(t.sessionId, t.cooldownUntilTurn.desc(), t.type, t.id.desc())
    .where(sql`${t.status} = 'resolved'`),
}))

export const npcs = pgTable('npcs', {
  id: uuid('id').primaryKey().defaultRandom(),
  sessionId: uuid('session_id').notNull()
    .references(() => roleplaySessions.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  role: text('role').notNull(),
  /** NPC Knowledge Boundary — 알 수 없는 정보로 행동하지 못하게 한다. */
  knows: jsonb('knows').$type<string[]>().notNull().default([]),
  relationshipToCharacter: text('relationship_to_character').notNull().default(''),
  relationshipToUser: text('relationship_to_user').notNull().default(''),
  isActive: boolean('is_active').notNull().default(true),
}, (t) => ({ sessionIdx: index('npcs_session_idx').on(t.sessionId, t.isActive) }))

/**
 * 장기 기억. sessionId 로 격리되며 다른 캐릭터/세션에 노출되지 않는다.
 * 대화 원문이 아니라 요약된 중요 정보만 담는다.
 */
export const memories = pgTable('memories', {
  id: uuid('id').primaryKey().defaultRandom(),
  sessionId: uuid('session_id').notNull()
    .references(() => roleplaySessions.id, { onDelete: 'cascade' }),
  characterId: uuid('character_id').notNull()
    .references(() => characters.id, { onDelete: 'cascade' }),

  type: text('type').notNull(),
  content: text('content').notNull(),
  importance: integer('importance').notNull(),     // 0-100 (0-1 을 정수로 저장)
  persistence: integer('persistence').notNull(),
  confidence: integer('confidence').notNull(),
  sourceMessageId: uuid('source_message_id'),
  /** 기억 그래프의 엣지. 태그를 공유하는 기억끼리 연결된다. */
  tags: text('tags').array().notNull().default([]),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  sessionIdx: index('memories_session_idx').on(t.sessionId, t.importance),
  tagsIdx: index('memories_tags_idx').using('gin', t.tags),
}))

export const scenes = pgTable('scenes', {
  id: uuid('id').primaryKey().defaultRandom(),
  sessionId: uuid('session_id').notNull()
    .references(() => roleplaySessions.id, { onDelete: 'cascade' }),
  location: text('location').notNull(),
  time: text('time').notNull(),
  mood: text('mood').notNull().default(''),
  weather: text('weather').notNull().default(''),
  /** 동일 조건이면 같은 키 → 기존 asset 재사용 → 새 생성 usage 미소비. */
  sceneKey: text('scene_key').notNull(),
  backgroundAssetId: uuid('background_asset_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  keyIdx: index('scenes_session_key_idx').on(t.sessionId, t.sceneKey),
}))


/* ─────────────── Generated media (M2) ─────────────── */

/**
 * 생성된 미디어. sceneKey / promptKey 로 캐시되어 같은 조건이면 재사용한다.
 * 재사용은 새 생성이 아니므로 Usage 를 소비하지 않는다.
 */
export const generatedMedia = pgTable('generated_media', {
  id: uuid('id').primaryKey().defaultRandom(),
  sessionId: uuid('session_id')
    .references(() => roleplaySessions.id, { onDelete: 'cascade' }),
  characterId: uuid('character_id').notNull()
    .references(() => characters.id, { onDelete: 'cascade' }),

  kind: text('kind', {
    enum: ['photo', 'background', 'live_scene', 'face_cast'],
  }).notNull(),

  url: text('url').notNull(),
  /** 동일 조건 재생성을 막는 캐시 키. */
  cacheKey: text('cache_key').notNull(),
  prompt: text('prompt').notNull().default(''),

  /** 어떤 Visual Identity 판으로 만들었는지. 일관성 추적에 사용한다. */
  visualIdentityId: uuid('visual_identity_id')
    .references(() => characterVisualIdentities.id, { onDelete: 'set null' }),
  visualIdentityVersion: integer('visual_identity_version'),

  providerMetadata: jsonb('provider_metadata').$type<Record<string, unknown>>()
    .notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  cacheIdx: index('media_cache_idx').on(t.characterId, t.kind, t.cacheKey),
  sessionIdx: index('media_session_idx').on(t.sessionId, t.createdAt),
}))


/* ─────────────── Reality Activation (M2) ─────────────── */

/**
 * 캐릭터 선연락 기록.
 * (session_id, dedupe_key) UNIQUE 로 같은 사유의 반복 발송을 DB 레벨에서 막는다.
 */
export const realityContacts = pgTable('reality_contacts', {
  id: uuid('id').primaryKey().defaultRandom(),
  sessionId: uuid('session_id').notNull()
    .references(() => roleplaySessions.id, { onDelete: 'cascade' }),
  channel: text('channel').notNull(),
  dedupeKey: text('dedupe_key').notNull(),
  reason: text('reason').notNull().default(''),
  /** 발송된 내용. 채널에 따라 text / mediaId 등. */
  payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
  status: text('status', { enum: ['pending', 'sent', 'opened', 'suppressed'] }).notNull(),
  suppressedReason: text('suppressed_reason'),
  messageId: uuid('message_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  sentAt: timestamp('sent_at', { withTimezone: true }),
  openedAt: timestamp('opened_at', { withTimezone: true }),
}, (t) => ({
  dedupeUniq: uniqueIndex('reality_contacts_session_dedupe_uniq').on(t.sessionId, t.dedupeKey),
  sessionIdx: index('reality_contacts_session_status_idx').on(t.sessionId, t.status, t.sentAt),
}))


/* ─────────────── Usage & entitlement (M3) ─────────────── */

/**
 * Asia/Seoul 달력 월 기준 공통 사용량. 기존 5시간 창은 legacy 기록으로 보존한다.
 * Free/Pro 는 같은 기능에 접근하고 limit 만 다르다.
 */
export const usageWindows = pgTable('usage_windows', {
  period: text('period').notNull().default('monthly'),
  policyVersion: text('policy_version').notNull().default('monthly-v1-dev'),
  continuityConsumed: integer('continuity_consumed').notNull().default(0),
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  plan: text('plan', { enum: ['free', 'pro'] }).notNull(),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
  endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
  consumed: integer('consumed').notNull().default(0),
  limit: integer('limit').notNull(),
}, (t) => ({ userIdx: index('usage_windows_user_ends_idx').on(t.userId, t.endsAt), monthlyUniq: uniqueIndex('usage_windows_monthly_uniq').on(t.userId, t.startedAt).where(sql`${t.period} = 'monthly'`) }))

/** 차감 원장. idempotency_key UNIQUE 가 이중 차감을 DB 레벨에서 막는다. */
export const usageLedger = pgTable('usage_ledger', {
  id: uuid('id').primaryKey().defaultRandom(),
  windowId: uuid('window_id').notNull().references(() => usageWindows.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  kind: text('kind').notNull(),
  continuity: boolean('continuity').notNull().default(false),
  units: integer('units').notNull().default(1),
  amount: integer('amount').notNull(),
  idempotencyKey: text('idempotency_key').notNull().unique(),
  status: text('status', { enum: ['reserved', 'committed', 'rolled_back'] }).notNull().default('reserved'),
  /** 이 예약이 충전 잔액에서 쓴 양. 월간에서 쓴 양은 amount - fromGrants. 복구가 출처를 가리는 근거다. */
  fromGrants: integer('from_grants').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ windowIdx: index('usage_ledger_window_idx').on(t.windowId) }))

/**
 * 충전 잔액. 월간 창과 분리돼 있어 월초 초기화의 영향을 받지 않는다.
 * 남은 양 = amount - consumed - refunded. 유효기간 정책은 미확정이라 expiresAt 은 null 을 허용한다.
 */
export const rechargeGrants = pgTable('recharge_grants', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  amount: integer('amount').notNull(),
  consumed: integer('consumed').notNull().default(0),
  refunded: integer('refunded').notNull().default(0),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  source: text('source', { enum: ['purchase', 'grant', 'refund_reversal'] }).notNull(),
  /** 검증된 서버 결제 결과만 채운다. (provider, externalRef) UNIQUE 가 이중 지급을 막는다. */
  provider: text('provider'),
  externalRef: text('external_ref'),
  status: text('status', { enum: ['active', 'revoked'] }).notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ activeIdx: index('recharge_grants_user_active_idx').on(t.userId, t.expiresAt, t.createdAt) }))

/** 예약 한 건이 어느 잔액에서 얼마를 썼는지. 한 예약이 여러 잔액에 걸칠 수 있다. */
export const rechargeLedger = pgTable('recharge_ledger', {
  id: uuid('id').primaryKey().defaultRandom(),
  ledgerId: uuid('ledger_id').notNull().references(() => usageLedger.id, { onDelete: 'cascade' }),
  grantId: uuid('grant_id').notNull().references(() => rechargeGrants.id, { onDelete: 'restrict' }),
  amount: integer('amount').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ ledgerIdx: index('recharge_ledger_ledger_idx').on(t.ledgerId) }))

/**
 * 구독 자격. 결제(P13)는 이 행을 쓰는 주체일 뿐이며 Usage Guard 는 여기와 users.plan 만 읽는다.
 * 해지 후에도 current_period_end 까지 Pro 자격을 유지한다 (명세서 10.3).
 */
export const subscriptions = pgTable('subscriptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().unique().references(() => users.id, { onDelete: 'cascade' }),
  plan: text('plan', { enum: ['pro'] }).notNull().default('pro'),
  status: text('status', { enum: ['active', 'cancelled', 'expired'] }).notNull(),
  renewalStatus: text('renewal_status', { enum: ['auto', 'cancelled'] }).notNull().default('auto'),
  currentPeriodStart: timestamp('current_period_start', { withTimezone: true }).notNull(),
  currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }).notNull(),
  /** 외부 결제 거래/구독 식별자. 복원(restore) 시 계정과 연결한다. */
  externalRef: text('external_ref').unique(),
  provider: text('provider'),
  /**
   * 마지막으로 보낸 만료 안내. 자동 갱신이 없으므로 끝나기 전에 알려야 이어서 쓸 수 있다.
   * null → 'soon'(3일 전) → 'ended'(당일). 행에 남겨 15분마다 도는 cron 의 중복 발송을 막는다.
   */
  expiryNotice: text('expiry_notice', { enum: ['soon', 'ended'] }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})


/* ─────────────── Calls (M2) ─────────────── */

/**
 * 통화 세션. 수락 전에 사용자는 voice/video 를 알아야 하므로 channel 은 생성 시 확정된다.
 * 세션당 ringing 은 하나뿐 (partial UNIQUE) — 중복 수신을 막는다.
 */
export const callSessions = pgTable('call_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  sessionId: uuid('session_id').notNull()
    .references(() => roleplaySessions.id, { onDelete: 'cascade' }),
  channel: text('channel', { enum: ['voice', 'video'] }).notNull(),
  direction: text('direction', { enum: ['incoming', 'outgoing'] }).notNull(),
  status: text('status', { enum: ['ringing', 'active', 'ended', 'missed', 'declined'] }).notNull(),
  reason: text('reason'),
  startedAt: timestamp('started_at', { withTimezone: true }),
  endedAt: timestamp('ended_at', { withTimezone: true }),
  durationSec: integer('duration_sec'),
  result: text('result'),
  /** 통화 시작 시 1분 예약, 종료 시 실제 분으로 보정. */
  usageReservationId: uuid('usage_reservation_id'),
  providerMetadata: jsonb('provider_metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  ringingUniq: uniqueIndex('call_sessions_one_ringing_per_session')
    .on(t.sessionId).where(sql`${t.status} = 'ringing'`),
  sessionIdx: index('call_sessions_session_idx').on(t.sessionId, t.createdAt),
}))


/* ─────────────── Reporting & account (M3) ─────────────── */

/**
 * 콘텐츠 신고. 대상은 개별 메시지/사진/Live Scene 이다.
 * (reporter, target) UNIQUE 로 중복 신고를 막고, 신고 당시 내용을 스냅샷으로 남겨
 * 대상이 삭제돼도 검토 범위를 유지한다 (명세서 9.1 예외).
 */
export const reports = pgTable('reports', {
  id: uuid('id').primaryKey().defaultRandom(),
  reporterId: uuid('reporter_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  targetType: text('target_type', { enum: ['message', 'photo', 'live_scene'] }).notNull(),
  targetId: uuid('target_id').notNull(),
  reason: text('reason', { enum: ['safety', 'rights', 'harassment', 'inappropriate', 'other'] }).notNull(),
  detail: text('detail').notNull().default(''),
  characterId: uuid('character_id').references(() => characters.id, { onDelete: 'set null' }),
  sessionId: uuid('session_id').references(() => roleplaySessions.id, { onDelete: 'set null' }),
  targetSnapshot: jsonb('target_snapshot').$type<Record<string, unknown>>().notNull().default({}),

  status: text('status', { enum: ['pending', 'reviewing', 'resolved', 'dismissed'] }).notNull().default('pending'),
  /** 운영자 동시 처리 방지 (명세서 9.2 예외). */
  version: integer('version').notNull().default(1),
  reviewedBy: uuid('reviewed_by'),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  resolution: text('resolution'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  dupUniq: uniqueIndex('reports_reporter_target_uniq').on(t.reporterId, t.targetType, t.targetId),
  statusIdx: index('reports_status_idx').on(t.status, t.createdAt),
}))

/** 계정 삭제 요청. 확정 전 영향 정보를 보여주고, 확정 후 접근을 차단한다 (명세서 12.1). */
export const accountDeletions = pgTable('account_deletions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  status: text('status', { enum: ['requested', 'completed', 'failed'] }).notNull().default('requested'),
  impact: jsonb('impact').$type<Record<string, unknown>>().notNull().default({}),
  requestedAt: timestamp('requested_at', { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
})


/* ─────────────── Admin (M3) — 사용자 앱과 완전히 분리된 인증 ─────────────── */

export const adminUsers = pgTable('admin_users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: text('role', { enum: ['viewer', 'reviewer', 'superadmin'] }).notNull().default('viewer'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  disabledAt: timestamp('disabled_at', { withTimezone: true }),
})

export const adminSessions = pgTable('admin_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  adminId: uuid('admin_id').notNull().references(() => adminUsers.id, { onDelete: 'cascade' }),
  token: text('token').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
})

/** 감사 로그. 누가 어떤 신고에 무엇을 했는지 — 되돌릴 수 없는 append-only. */
export const adminActions = pgTable('admin_actions', {
  id: uuid('id').primaryKey().defaultRandom(),
  adminId: uuid('admin_id').notNull().references(() => adminUsers.id),
  reportId: uuid('report_id').references(() => reports.id, { onDelete: 'set null' }),
  action: text('action', {
    enum: ['start_review', 'hide_content', 'restrict_session', 'resolve_no_action', 'dismiss', 'reopen',
      'bank_order_approve', 'bank_order_reject',
      'character_set_reality', 'character_set_chat'],
  }).notNull(),
  previousStatus: text('previous_status'),
  newStatus: text('new_status'),
  note: text('note').notNull().default(''),
  /** 계좌이체 승인·거절도 같은 감사 로그를 쓴다. */
  bankOrderId: uuid('bank_order_id'),
  /** 캐릭터 경험 유형 지정도 여기 남긴다 — 누가 언제 어느 캐릭터를 미로에 넣었는지. */
  characterId: uuid('character_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ reportIdx: index('admin_actions_report_idx').on(t.reportId, t.createdAt) }))


/**
 * 계좌이체 주문. 사용자가 입금하겠다고 선언하면 한 줄이 생기고, 운영자가 실제 입금을
 * 확인해 승인해야 지급된다. **주문 생성은 지급이 아니다.**
 *
 * 승인은 payment_events 를 거쳐 지급하므로 이중 지급을 막는 지점은 그쪽 UNIQUE 하나뿐이다.
 * 금액·지급량은 주문 시점에 서버 카탈로그에서 확정해 여기 박는다 — 카탈로그가 나중에
 * 바뀌어도 접수된 주문은 접수 당시 조건으로 처리된다.
 */
export const bankTransferOrders = pgTable('bank_transfer_orders', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  kind: text('kind', { enum: ['pass', 'recharge'] }).notNull(),
  /** 충전이면 서버 카탈로그의 상품 id, 이용권이면 null. */
  productId: text('product_id'),
  amountMinor: integer('amount_minor').notNull(),
  currency: text('currency').notNull(),
  units: integer('units'),
  /** 입금자명 — 같은 금액의 주문이 여럿일 때 어느 입금인지 가르는 단서. */
  depositorName: text('depositor_name').notNull(),
  /** 사용자에게 보여 주는 대조 코드. 입금자명 뒤에 붙이도록 안내한다. */
  referenceCode: text('reference_code').notNull().unique(),
  status: text('status', { enum: ['awaiting', 'approved', 'rejected', 'expired'] }).notNull().default('awaiting'),
  decidedBy: uuid('decided_by').references(() => adminUsers.id),
  decidedAt: timestamp('decided_at', { withTimezone: true }),
  note: text('note').notNull().default(''),
  /** 지급이 끝난 시각. 승인(운영 앱)과 지급(web cron)이 나뉘어 있어 그 사이를 이 값이 가른다. */
  settledAt: timestamp('settled_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  /** 지나도 입금이 없으면 만료. 무기한 대기 주문을 남기지 않는다. */
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
}, (t) => ({
  statusIdx: index('bank_transfer_orders_status_idx').on(t.status, t.createdAt),
  userIdx: index('bank_transfer_orders_user_idx').on(t.userId, t.createdAt),
}))

/* ─────────────── Analytics (P12) ─────────────── */

/**
 * 제품 퍼널 이벤트. 관계 내부 수치는 절대 싣지 않는다 (sanitize 로 강제).
 * 사용자 삭제 시 함께 지워진다.
 */
export const analyticsEvents = pgTable('analytics_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
  event: text('event').notNull(),
  props: jsonb('props').$type<Record<string, string | number | boolean | null>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ eventIdx: index('analytics_event_time_idx').on(t.event, t.createdAt) }))


/* ─────────────── Payments (P13) ─────────────── */

/**
 * 결제 이벤트 원장. (provider, external_event_id) UNIQUE 로 같은 webhook 이 두 번 와도 한 번만 적용된다.
 * 구독 자격(subscriptions)은 이 원장을 적용한 결과다.
 */
export const paymentEvents = pgTable('payment_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  provider: text('provider').notNull(),
  externalEventId: text('external_event_id').notNull(),
  /** 구독/거래 식별자. 복원(restore) 시 계정과 다시 연결하는 열쇠. */
  externalRef: text('external_ref').notNull(),
  type: text('type', { enum: ['purchase', 'renewal', 'cancel', 'refund', 'failed'] }).notNull(),
  periodEnd: timestamp('period_end', { withTimezone: true }),
  payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  idemUniq: uniqueIndex('payment_events_provider_event_uniq').on(t.provider, t.externalEventId),
  refIdx: index('payment_events_ref_idx').on(t.externalRef),
}))

/**
 * 캐릭터 댓글. 사용자가 남기는 공개 글이라 신고·숨김 대상이 된다 (명세서 9).
 * parentId 가 있으면 답글 — 1단계만 허용한다 (답글의 답글은 부모 댓글에 묶는다, 레퍼런스 UI와 동일).
 */
export const characterComments: any = pgTable('character_comments', {
  id: uuid('id').primaryKey().defaultRandom(),
  characterId: uuid('character_id').notNull().references(() => characters.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  parentId: uuid('parent_id').references((): any => characterComments.id, { onDelete: 'cascade' }),
  body: text('body').notNull(),
  /** 운영자가 숨기면 목록에서 빠진다. 원문은 남겨 검토 이력을 지킨다. */
  hiddenAt: timestamp('hidden_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  charIdx: index('character_comments_char_idx').on(t.characterId, t.createdAt),
  parentIdx: index('character_comments_parent_idx').on(t.parentId),
}))

/** 댓글 좋아요. 한 사용자가 같은 댓글을 두 번 좋아요할 수 없다. */
export const characterCommentLikes = pgTable('character_comment_likes', {
  id: uuid('id').primaryKey().defaultRandom(),
  commentId: uuid('comment_id').notNull().references(() => characterComments.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  uniq: uniqueIndex('character_comment_likes_uniq').on(t.userId, t.commentId),
  commentIdx: index('character_comment_likes_comment_idx').on(t.commentId),
}))

/** 북마크. 한 사용자가 같은 캐릭터를 두 번 담을 수 없다. */
export const characterBookmarks = pgTable('character_bookmarks', {
  id: uuid('id').primaryKey().defaultRandom(),
  characterId: uuid('character_id').notNull().references(() => characters.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  uniq: uniqueIndex('character_bookmarks_uniq').on(t.userId, t.characterId),
  userIdx: index('character_bookmarks_user_idx').on(t.userId, t.createdAt),
}))

/**
 * AI 호출 한 번 = 한 줄 (성공·실패 모두). Usage Manager 가 쓰고 Budget Guard 가 읽는다.
 * 원가 기록은 이 표에, 호출 전 원자적 한도 예약은 ai_budget_counters에 저장한다.
 */
export const aiUsage = pgTable('ai_usage', {
  attemptId: uuid('attempt_id').unique(),
  traceId: uuid('trace_id'), requestId: uuid('request_id'),
  modelId: text('model_id'), modelVersion: text('model_version'), promptVersion: text('prompt_version'),
  usageUnits: integer('usage_units').notNull().default(0),
  actualCost: numeric('actual_cost', { precision: 12, scale: 8 }),
  reservedCost: numeric('reserved_cost', { precision: 12, scale: 8 }).notNull().default('0'),
  budgetKeys: jsonb('budget_keys').$type<string[]>().notNull().default([]),
  status: text('status').notNull().default('completed'),
  fallbackUsed: boolean('fallback_used').notNull().default(false),
  shadow: boolean('shadow').notNull().default(false),

  id: bigserial('id', { mode: 'number' }).primaryKey(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  sessionId: uuid('session_id'),
  ip: text('ip'),
  task: text('task').notNull(),
  provider: text('provider').notNull(),
  model: text('model').notNull(),
  inputTokens: integer('input_tokens'),
  outputTokens: integer('output_tokens'),
  /** 달러. 무료 등급 모델은 0. */
  estimatedCost: numeric('estimated_cost', { precision: 12, scale: 8 }),
  latencyMs: integer('latency_ms').notNull(),
  ok: boolean('ok').notNull(),
  error: text('error'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  traceIdx: index('ai_usage_trace_idx').on(t.traceId),
  modelIdx: index('ai_usage_model_time_idx').on(t.modelId, t.createdAt),
  createdIdx: index('ai_usage_created_idx').on(t.createdAt),
  userIdx: index('ai_usage_user_idx').on(t.userId, t.createdAt),
  ipIdx: index('ai_usage_ip_idx').on(t.ip, t.createdAt),
})).enableRLS()

/** Closed Alpha 웨이트리스트 — 체험(게스트 계정) 뒤에 남기는 이메일. */
export const alphaWaitlist = pgTable('alpha_waitlist', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

/** Atomic counters; reserve before inference. Failed/unknown calls retain their conservative cost reservation. */
export const aiBudgetCounters = pgTable('ai_budget_counters', {
  key: text('key').primaryKey(), requests: integer('requests').notNull().default(0),
  cost: numeric('cost', { precision: 16, scale: 8 }).notNull().default('0'),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
}).enableRLS()

/** Request deduplication stores IDs and output only as application data, never as training data. */
export const conversationRequests = pgTable('conversation_requests', {
  id: uuid('id').primaryKey(), userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  sessionId: uuid('session_id').notNull().references(() => roleplaySessions.id, { onDelete: 'cascade' }),
  inputHash: text('input_hash').notNull(), status: text('status').notNull().default('pending'),
  result: jsonb('result'), leaseUntil: timestamp('lease_until', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, t => ({ sessionIdx: index('conversation_requests_session_idx').on(t.sessionId, t.status), userIdx: index('conversation_requests_user_idx').on(t.userId) })).enableRLS()

/** Consent-gated signals, no conversation body in operational telemetry. */
export const aiFeedback = pgTable('ai_feedback', {
  id: uuid('id').primaryKey().defaultRandom(), userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  requestId: uuid('request_id').notNull().references(() => conversationRequests.id, { onDelete: 'cascade' }),
  signal: text('signal').notNull(), consentVersion: text('consent_version').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, t => ({ userIdx: index('ai_feedback_user_idx').on(t.userId), requestIdx: index('ai_feedback_request_idx').on(t.requestId) })).enableRLS()

export const aiEvaluationSamples = pgTable('ai_evaluation_samples', {
  id: uuid('id').primaryKey().defaultRandom(), userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  requestId: uuid('request_id').notNull().references(() => conversationRequests.id, { onDelete: 'cascade' }),
  consentVersion: text('consent_version').notNull(), content: jsonb('content').notNull(),
  reviewStatus: text('review_status').notNull().default('pending'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, t => ({ userIdx: index('ai_evaluation_samples_user_idx').on(t.userId), requestIdx: uniqueIndex('ai_evaluation_samples_request_idx').on(t.requestId) })).enableRLS()

export const characterLikes = pgTable('character_likes', {
  id: uuid('id').primaryKey().defaultRandom(),
  characterId: uuid('character_id').notNull().references(() => characters.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ uniq: uniqueIndex('character_likes_uniq').on(t.characterId, t.userId) }))

/** Server-only durable Web Push work, created in the message transaction. */
export const realityPushJobs = pgTable('reality_push_jobs', {
  id: uuid('id').primaryKey().defaultRandom(),
  contactId: uuid('contact_id').notNull().references(() => realityContacts.id, { onDelete: 'cascade' }),
  subscriptionId: uuid('subscription_id').notNull().references(() => pushSubscriptions.id, { onDelete: 'cascade' }),
  status: text('status', { enum: ['pending', 'sending', 'sent', 'cancelled', 'failed'] }).notNull().default('pending'),
  attempts: integer('attempts').notNull().default(0),
  nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }).notNull().defaultNow(),
  leaseUntil: timestamp('lease_until', { withTimezone: true }),
  leaseToken: uuid('lease_token'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, t => ({
  uniqueDelivery: uniqueIndex('reality_push_jobs_delivery_uniq').on(t.contactId, t.subscriptionId),
  due: index('reality_push_jobs_due_idx').on(t.nextAttemptAt).where(sql`${t.status} in ('pending', 'sending')`),
  subscription: index('reality_push_jobs_subscription_idx').on(t.subscriptionId),
}))
