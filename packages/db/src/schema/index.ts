import {
  boolean, index, integer, jsonb, pgTable, text, timestamp, uuid,
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
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

/**
 * Character Core — 안정적으로 유지되는 정체성.
 * Dynamic State(감정/관계/세계 위치)는 여기 저장하지 않는다.
 */
export const characters = pgTable('characters', {
  id: uuid('id').primaryKey().defaultRandom(),
  /** null = 공식 캐릭터 (토마스/강태윤/히사시) */
  ownerId: uuid('owner_id').references(() => users.id, { onDelete: 'cascade' }),
  isOfficial: boolean('is_official').notNull().default(false),

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
    enum: ['text', 'photo', 'voice_message', 'event_card', 'call_record', 'live_scene'],
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
