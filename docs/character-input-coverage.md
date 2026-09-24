# Character input coverage

P1 context coverage record, 2026-09-24. This documents data delivery and tested boundaries, not a claim that an LLM always behaves consistently or has human free will.

## Authored settings and their consumers

`apps/web/lib/simulation/character-context.ts` maps persisted character and the latest active visual identity into one canonical authored projection. Both `loadSession` (dialogue and calls) and `loadRealityContext` (proactive contact) use this mapper. Proactive prompts receive authored fields without owner/account identifiers.

| Creator data | Persisted source | Dialogue context | Proactive context / other intended use |
| --- | --- | --- | --- |
| Name, age, nationality, occupation, MBTI | `characters` | Authored identity in system prompt | Same authored identity; nationality and MBTI must not be used to invent stereotypes |
| Personality; jealousy, initiative, emotional expression | `characters` | Personality and trait values | Same authored personality; runtime action policy remains separate |
| Values, speech style, user nickname | `characters` | Explicit value, speech, and address instructions | Same fields; legacy/official data is supported even though current form folds most prose into personality |
| Hobbies, dislikes | `characters` | Explicit authored preferences | Same fields; existing hidden form values are retained |
| Social position | `characters` | World role | Same field; no inferred occupation or status |
| World description, genre | `worlds` | World context | Same authored world description and genre |
| First scene | `characters.startingContext` | The starting scene, not a claim that the scene is still current | Same starting context; current place/status arrive separately |
| Situation examples | `characters.sampleDialogue` without `purpose=intro` | Style examples, not actual experiences | Same examples with the same distinction |
| Intro narrator and character messages | `messages`, seeded at session creation | Actual ordered history with correct roles | Included while within recent-history window; narrator is explicitly omniscient, not character knowledge |
| Face, hair, body, height, appearance detail, style, expression, outfit | Latest active `character_visual_identities` by version | Authored visual facts, only relevant in appearance questions/scenes | Same visual facts; empty or image-only details are not invented |
| Starting relationship and its numeric settings | `characters.initialRelationship` → `relationships` | Current session relationship, initialized once | Existing relationship guidance/action policy; not reset every turn |
| First-contact switch, contact frequency, contact initiative | `contact_profiles` | Operational policy, not a personality fact | Existing permission and scheduling/action inputs; this patch does not replace their policy |
| Contact sender name | Contact presentation | No invented personality | Presentation label for delivered contact |
| Public/private, profile image, card introduction, colors, relationship search keywords | Character display/search fields | Not promoted into fictional experiences | Display/access/search concerns; images are not silently converted into inferred biography |
| Legacy lore | `characters.lore` | Existing keyword retrieval | Preserved in authored background; proactive retrieval granularity is not identical to dialogue retrieval |

## History and knowledge boundaries

- Both loaders reject another user's session and exclude hidden/system messages from conversational history.
- Narrator and NPC rows retain their role, source message ID, message kind, timestamp, and available NPC speaker. Mixed roleplay blocks retain block type/speaker rather than silently becoming the main character's dialogue.
- The proactive path now includes its own prior `reality_message` rows and other visible message kinds. Delivery failure is not synthesized into a successful message by this projection.
- Dialogue and proactive prompts mark narrator/narrative/world material as omniscient stage context. An unseen secret is not automatically known by the character. NPC claims are not automatically true.
- Semantic-event and memory-analysis history excludes omniscient rows. Narrative/world blocks are removed from mixed messages before that analysis, including their copy in `content`.
- **Remaining limitation:** the existing schema has no per-observer knowledge/access metadata for all narrative facts. A prompt boundary is not a proof against model leakage. Raw current user prose and old memories may also contain unclassified narration; this patch does not rewrite historical memories. Full character knowledge isolation requires structured evidence and observer access in the agency pipeline.
- History remains bounded: dialogue loads 24 rows, proactive contact 12. Engine budgeting can discard history/memories. This is field delivery coverage, not a guarantee that every prior message or every source character is present in every inference.

## Evidence

- `apps/web/lib/simulation/character-context.integration.test.ts`: submitted form → persisted character/world/visuals → reply/proactive context parity; latest active visual selection; narrator intro and NPC labels; source metadata; prior contact; hidden/system/other-session exclusion.
- `packages/engine/src/__tests__/context.test.ts`: authored nationality/MBTI/nickname/world role/appearance and role-preserving prompt assembly; existing budget tests.
- `packages/providers/src/__tests__/reality-grounding.test.ts`: full authored settings, narrator/NPC/source metadata, own prior contact, no stereotype or invented-experience instructions.
- `packages/engine/src/__tests__/knowledge-context.test.ts`: narrator-only and mixed-block secrets are excluded before semantic/memory inference.

These tests use deterministic provider mocks and a guarded local test database. They validate wiring and data boundaries; live-model persona fidelity and longitudinal behavior require separate evaluations.

## Opt-in agency Reality path

`apps/web/lib/reality/agency.ts` uses the same compiled character revision, planner, evidence loader, realization verifier and receipt reducer as the live chat path. This is behind the default-off character-agency cohort gate.

- The live renderer receives the pinned authored identity/personality/world/appearance and the planner's participant-message evidence. It does not load omniscient narrator text or unsourced legacy memories into a second rendering context.
- A character may choose to wait. Existing pending intents, event rules and legacy motivation cannot override that live choice. Unsupported media/call/world executors are not advertised; the implemented dispatch is an in-app message.
- Delivery rechecks contact permission, active hours, cooldown, unread limit, owner/session state, session progress and runtime/world/relationship versions. Quiet hours prevent a push while allowing the non-intrusive in-app message.
- Message, contact, actual `sent` receipt, decision, bounded relationship update and runtime state commit in one transaction. `sent` does not imply delivered, read or answered. A failed verifier or stale transaction leaves no successful action record.
- Repeated ticks without new evidence or due real-time goals do not call the planner. Active due goals use a bounded wake-up backoff; this does not advance fictional time or simulate unimplemented background activity.
- Shadow evaluates without saving agency runtime changes, decisions or output. The existing baseline path remains responsible for any user-visible behavior in shadow mode.

`apps/web/lib/reality/__tests__/agency.integration.test.ts` tests the real planner/reducer/verifier against recorded synthetic provider responses and a local database, including concurrent ticks, post-insert rollback, permission changes, pinned context, quiet hours, receipt semantics and replay prevention. These are not live-model quality or production-delivery claims.
