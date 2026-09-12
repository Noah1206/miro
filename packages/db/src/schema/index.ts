import { sql } from 'drizzle-orm'
import {
  boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid,
} from 'drizzle-orm/pg-core'

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  displayName: text('display_name'),

  /** Free/Pro 자격. 결제(Phase 13) 이전에는 dev 토글/Admin 이 이 값을 쓴다. */
  plan: text('plan', { enum: ['free', 'pro'] }).notNull().default('free'),

  adultVerifiedAt: timestamp('adult_verified_at', { withTimezone: true }),
  adultVerifyFailedAt: timestamp('adult_verify_failed_at', { withTimezone: true }),

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
  age: integer('age'),
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
  relationshipKeywords: jsonb('relationship_keywords').$type<string[]>().notNull().default([]),
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

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
}, (t) => ({
  ownerIdx: index('characters_owner_idx').on(t.ownerId),
  officialIdx: index('characters_official_idx').on(t.isOfficial),
}))

/**
 * Visual Identity — Profile / AI Photo / Dynamic Scene / Live Scene / Video Call
 * 전부가 동일한 이 레코드를 기준으로 삼는다. 기능마다 다른 외형을 만들지 않는다.
 */
export const characterVisualIdentities = pgTable('character_visual_identities', {
  id: uuid('id').primaryKey().defaultRandom(),
  characterId: uuid('character_id').notNull().references(() => characters.id, { onDelete: 'cascade' }),
  version: integer('version').notNull().default(1),

  baseFace: jsonb('base_face').$type<Record<string, unknown>>().notNull().default({}),
  bodyProfile: jsonb('body_profile').$type<Record<string, unknown>>().notNull().default({}),
  hair: jsonb('hair').$type<Record<string, unknown>>().notNull().default({}),
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

  /** 메신저형 | 균형형 | 서사형 (명세서 3.1) */
  outputStyle: text('output_style', { enum: ['messenger', 'balanced', 'narrative'] })
    .notNull().default('balanced'),

  /** Event cooldown 계산의 기준. 스토리 진행 트리거로는 사용하지 않는다. */
  turnCount: integer('turn_count').notNull().default(0),

  status: text('status', { enum: ['active', 'archived'] }).notNull().default('active'),
  lastInteractionAt: timestamp('last_interaction_at', { withTimezone: true }).notNull().defaultNow(),

  /** RP 턴에서 AI 가 제안한 "나중에 연락하고 싶은 이유". 스케줄러가 우선 참고한다. */
  pendingRealityIntent: jsonb('pending_reality_intent')
    .$type<{ channel: string; reason: string; urgency: number }>(),
  /** 스케줄러가 마지막으로 이 세션의 선연락을 판단한 시각. */
  realityCheckedAt: timestamp('reality_checked_at', { withTimezone: true }),
  /** 캐릭터 상태 한 줄 ('status' 채널). Chats 목록과 헤더에 표시. */
  characterStatus: text('character_status'),
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

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  // 한 턴에 캐릭터/NPC/서술 메시지가 여러 개 나올 수 있으므로 unique 제약을 두지 않는다.
  sessionIdx: index('messages_session_idx').on(t.sessionId, t.turnIndex),
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
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  sessionIdx: index('memories_session_idx').on(t.sessionId, t.importance),
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
 * 5시간 사용량 창. 창 시작 = 첫 생성 AI Request 시각 (소진 시점이 아니다).
 * Free/Pro 는 같은 기능에 접근하고 limit 만 다르다.
 */
export const usageWindows = pgTable('usage_windows', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  plan: text('plan', { enum: ['free', 'pro'] }).notNull(),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
  endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
  consumed: integer('consumed').notNull().default(0),
  limit: integer('limit').notNull(),
}, (t) => ({ userIdx: index('usage_windows_user_ends_idx').on(t.userId, t.endsAt) }))

/** 차감 원장. idempotency_key UNIQUE 가 이중 차감을 DB 레벨에서 막는다. */
export const usageLedger = pgTable('usage_ledger', {
  id: uuid('id').primaryKey().defaultRandom(),
  windowId: uuid('window_id').notNull().references(() => usageWindows.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  kind: text('kind').notNull(),
  units: integer('units').notNull().default(1),
  amount: integer('amount').notNull(),
  idempotencyKey: text('idempotency_key').notNull().unique(),
  status: text('status', { enum: ['reserved', 'committed', 'rolled_back'] }).notNull().default('reserved'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ windowIdx: index('usage_ledger_window_idx').on(t.windowId) }))

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
