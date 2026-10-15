import type { StoryDefinition } from '@miro/domain'
import { academy } from './academy'
import { beauty } from './beauty'
import { salvage } from './salvage'
import { actor } from './actor'
import { contract } from './contract'
import { STORY_ENTRIES } from './entry'

/** 작품 원본(코드). 시드 스크립트가 DB(stories·story_private)로 옮긴다 — 실행 중엔 DB 를 읽는다. 서버 전용. 순서 = 목록 순서. */
export const STORY_DEFINITIONS: StoryDefinition[] = [academy, beauty, salvage, actor, contract].map(def => ({ ...def, entry: STORY_ENTRIES[def.slug], protagonist: { ...def.protagonist, fields: [...def.protagonist.fields.filter(f => f !== '나이(25세 이상)'), '내 성격과 배경'] } }))
