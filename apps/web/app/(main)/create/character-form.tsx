'use client'
import { introDialogue, sampleDialogue } from '@/lib/intro-dialogue'
import { ContactSettings, RelationshipSettings } from './creation-settings'
import type { ContactCapabilities } from '@/lib/reality/channels'
import { useMemo, useRef, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { BUILD_PRESETS, BUILD_TYPES, GENDER_PRESETS, GENDER_TYPES } from '@miro/domain'
import { CreateHeader, type CreateTab } from './header'
import { CreateTour } from './tour'
import { DetailPreview, snapshot, type Snapshot } from './preview'
import { ChoiceChips, CountedInput, CountedTextArea, DialogueEditor, ImagePicker, LabeledField, PresetTags, Switch, TagInput, box, type Step } from './form-parts'
import { MOODS } from './parse'

const MBTI_TYPES = [
  'INTJ', 'INTP', 'ENTJ', 'ENTP', 'INFJ', 'INFP', 'ENFJ', 'ENFP',
  'ISTJ', 'ISFJ', 'ESTJ', 'ESFJ', 'ISTP', 'ISFP', 'ESTP', 'ESFP',
] as const
export type FormInitial = {
  name: string; title: string; worldSetting: string; age: string; mbti: string; nationality: string; occupation: string
  personality: string; hobbies: string[]; dislikes: string[]; mood: string[]; jealousy: number; initiative: number; emotionalExpression: number
  gender: string; build: string; height: string; detail: string
  eyes: string; nose: string; jaw: string; skin: string; distinctive: string
  hairColor: string; hairLength: string; hairStyle: string; expression: string; styleTags: string[]
  stage: string; trust: number; attraction: number; emotionalDistance: number; attachment: number; protectiveness: number; relJealousy: number
  /** 친해지는 곡선. '' 이면 성향값으로 정한다. */
  bonding: string
  relationshipKeywords: string[]
  contactEnabled: boolean; contactFrequency: number; initiativeLevel: number; replyDelayMinutes: number
  activeHoursStart: string; activeHoursEnd: string; preferredChannel: string
  photoProbability: number; voiceMessageProbability: number; callProbability: number; videoCallProbability: number; senderLabel: string
  startingContext: string; startingTime: string; sampleDialogue: Array<{ role: 'character' | 'user' | 'narrator'; text: string; purpose?: 'intro' }>
  lore: Array<{ keywords: string[]; content: string }>
  experienceType?: 'chat' | 'reality'
  isPublic: boolean
  /** 이미 저장된 사진 URL (편집 화면). 대표가 첫 번째. */
  images: string[]
}

/** 빈 폼. 숫자 기본값은 parse.ts 의 fallback 과 같아야 한다. */
export const EMPTY: FormInitial = {
  name: '', title: '', worldSetting: '', age: '', mbti: '', nationality: '', occupation: '',
  personality: '', hobbies: [], dislikes: [], mood: [], jealousy: 50, initiative: 50, emotionalExpression: 50,
  gender: 'male', build: 'average', height: '', detail: '',
  eyes: '', nose: '', jaw: '', skin: '', distinctive: '',
  hairColor: '', hairLength: '', hairStyle: '', expression: '', styleTags: [],
  stage: 'stranger', trust: 30, attraction: 10, emotionalDistance: 60, attachment: 10, protectiveness: 20, relJealousy: 0, bonding: '',
  relationshipKeywords: [],
  contactEnabled: true, contactFrequency: 50, initiativeLevel: 50, replyDelayMinutes: 5,
  activeHoursStart: '08:00', activeHoursEnd: '23:00', preferredChannel: 'message',
  photoProbability: 20, voiceMessageProbability: 20, callProbability: 30, videoCallProbability: 10, senderLabel: '',
  startingContext: '', startingTime: '', sampleDialogue: [], lore: [],
  isPublic: true,
  images: [],
}

/**
 * 캐릭터 폼 — 만들기와 편집이 같은 화면이다 (명세서 2.2).
 * 탭은 보이기만 바꾼다 — 모든 칸이 DOM 에 남아 마지막에 한 번에 제출된다.
 * 등록 시 공개 여부를 선택할 수 있다. 임시저장은 항상 비공개다.
 */
export function CharacterForm({ mode, draft = false, initial, action, closeHref, capabilities }: {
  mode: 'create' | 'edit'
  capabilities: ContactCapabilities
  draft?: boolean
  initial?: Partial<FormInitial>
  action: (form: FormData) => Promise<void>
  closeHref: string
}) {
  const i: FormInitial = { ...EMPTY, ...initial }
  const [tab, setTab] = useState<CreateTab>('profile')
  // 상황은 전체 화면으로 열린다 — 닫으면 열기 전 탭으로 돌아간다.
  const [prevTab, setPrevTab] = useState<CreateTab>('profile')
  const [pending, setPending] = useState(false)

  // 필수 판정에 쓰는 값만 통제한다. 나머지는 uncontrolled — 제출 때 FormData 가 모은다.
  const [name, setName] = useState(i.name)
  const [title, setTitle] = useState(i.title)
  const [personality, setPersonality] = useState(i.personality)
  const [startingContext, setStartingContext] = useState(i.startingContext)
  const [sampleCharacterCount, setSampleCharacterCount] = useState(() => sampleDialogue(i.sampleDialogue).reduce((sum, turn) => sum + turn.text.length, 0))
  const [sampleOpen, setSampleOpen] = useState(false)
  const reduceMotion = useReducedMotion()
  const [mbti, setMbti] = useState<string>(i.mbti)
  const [gender, setGender] = useState<string>(i.gender)
  const [build, setBuild] = useState<string>(i.build)
  const [advanced, setAdvanced] = useState(false)
  const [profileAdvanced, setProfileAdvanced] = useState(false)
  const [isPublic, setIsPublic] = useState(draft ? true : i.isPublic)
  // 소개 페이지 미리보기 — 탭을 열 때 폼을 한 번 읽는다. 칸을 전부 controlled 로 바꾸지 않는다.
  const formRef = useRef<HTMLFormElement>(null)
  const [previewMode, setPreviewMode] = useState('detail')
  const [snap, setSnap] = useState<Snapshot | null>(null)
  const openTab = (t: CreateTab) => {
    if (t === 'intro' && tab !== 'intro') setPrevTab(tab)
    if (t === 'preview' && formRef.current) setSnap((prev) => { if (prev) [prev.photo, ...prev.gallery].forEach(url => { if (url?.startsWith('blob:')) URL.revokeObjectURL(url) }); return snapshot(formRef.current!) })
    setTab(t)
  }

  const missing = useMemo(() => {
    const m = new Set<CreateTab>()
    if (!name.trim() || !title.trim()) m.add('profile')
    if (!personality.trim()) m.add('profile')
    if (!startingContext.trim()) m.add('intro')
    return m
  }, [name, title, personality, startingContext])
  const canSubmit = missing.size === 0


  return (
    // Page 는 transform 을 걸어 sticky 를 깨뜨리므로 쓰지 않는다.
    <main id="main" tabIndex={-1} className="page" style={{ maxWidth: 560, paddingTop: 0, ...(mode === 'create' ? { paddingBottom: 'calc(var(--space-6) + env(safe-area-inset-bottom))' } : {}), outline: 'none' }}>
      <form ref={formRef} action={action} onSubmit={() => setPending(true)} className="stack" style={{ gap: 0 }}>

        <CreateHeader tab={tab} onTab={openTab} canSubmit={canSubmit} pending={pending} missingHint={!canSubmit ? `${[!name.trim() && '이름', !title.trim() && '소개', !personality.trim() && '성격', !startingContext.trim() && '첫 장면'].filter(Boolean).join(' · ')} 입력` : isPublic ? '공개 게시' : '나만 보기'}
          buttons={mode === 'edit' && !draft ? 'save' : 'create'} closeHref={closeHref} />
        {mode === 'create' && <CreateTour tab={tab} onTab={openTab} />}

        <input type="hidden" name="hobbies" value={i.hobbies.join(',')} />
        <input type="hidden" name="dislikes" value={i.dislikes.join(',')} />
        <input type="hidden" name="relationshipKeywords" value={i.relationshipKeywords.join(',')} />
        {/* ── 프로필 ── */}
        <Panel id="profile" show={tab === 'profile'}>
          <Section title="공개">
            <Card>
              <Switch name="isPublic" checked={isPublic} onChange={setIsPublic}
                label="다른 사람에게 공개"
                hint="게시할 때 켜져 있으면 홈과 검색에 실리고, 누구나 이 캐릭터와 대화를 시작할 수 있습니다." />
            </Card>
          </Section>
          <Section title="캐릭터">
            <Card>
              <ImagePicker label="캐릭터 이미지" maxCount={5} existing={i.images} />
              <div style={{ marginTop: 'var(--space-5)' }}>
                <IdentityCard>
                  <div className="stack" style={{ gap: 18 }}>
                    <LabeledField label="이름" required error={name === '' ? null : undefined}>
                      <Controlled name="name" placeholder="짧은 이름이 부르기 편해요. 예) 수현" max={10} value={name} onChange={setName} big />
                    </LabeledField>
                    <LabeledField label="소개" required hint="카드와 소개 페이지에서 이름 아래에 걸리는 한 줄. 캐릭터가 직접 하는 말이면 좋습니다.">
                      <Controlled name="title" placeholder="예) 만지지 마십시오. …그건, 아직 당신 것이 아닙니다." max={40} value={title} onChange={setTitle} big />
                    </LabeledField>
                    <LabeledField label="성격 설명" required hint="캐릭터의 성격, 가치관, 말투를 적어 주세요.">
                      <ControlledArea name="personality" value={personality} onChange={setPersonality} max={1000} rows={4}
                        placeholder="예) 침착하고 관찰력이 좋다. 신뢰와 약속을 중시하며, 낮고 짧은 말투로 이야기한다." />
                    </LabeledField>
                    <ReactionTraits initial={i} />
                  </div>
                </IdentityCard>
              </div>
              {/* 나이·MBTI·국적·직업은 고급 — 이름과 소개만으로 카드가 된다. 접혀 있어도 칸은 DOM 에 남아 제출된다. */}
              <AdvancedToggle open={profileAdvanced} onToggle={() => setProfileAdvanced((v) => !v)} controls="profile-advanced" />
              <div id="profile-advanced" hidden={!profileAdvanced}>
                <div className="stack" style={{ gap: 18, marginTop: 'var(--space-5)' }}>
                  <LabeledField label="나이"><CountedInput name="age" placeholder="예) 32, 1000, 추정불가" max={10} defaultValue={i.age} /></LabeledField>
                  <LabeledField label="MBTI">
                    <ChoiceChips name="mbti" value={mbti} onChange={setMbti} columns={4}
                      options={[{ value: '', label: '선택 안 함' }, ...MBTI_TYPES.map((m) => ({ value: m, label: m }))]} />
                  </LabeledField>
                  <Two>
                    <LabeledField label="국적"><CountedInput name="nationality" placeholder="예) 영국" max={40} defaultValue={i.nationality} /></LabeledField>
                    <LabeledField label="직업"><CountedInput name="occupation" placeholder="예) 고서 복원가" max={60} defaultValue={i.occupation} /></LabeledField>
                  </Two>
                </div>
              </div>
            </Card>
          </Section>

          <Section title="상황 예시 · 선택">
            <p className="t-caption" style={{ color: 'var(--color-text-tertiary)' }}>
              상황 예시로 캐릭터의 성격과 말투를 표현해 주세요. 상세페이지에 표시됩니다.<br />
              {sampleCharacterCount.toLocaleString()}자
            </p>
            <motion.button type="button" aria-expanded={sampleOpen} aria-controls="sample-dialogue-editor" onClick={() => setSampleOpen((open) => !open)}
              whileTap={reduceMotion ? undefined : { scale: 0.98 }}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', minHeight: 48, marginTop: 20, padding: '12px 16px', borderRadius: 'var(--radius-button)', border: 0, background: 'var(--color-surface-3)', color: 'var(--color-text-primary)', fontSize: 'var(--font-body-size)', cursor: 'pointer' }}>
              <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
              상황 예시 추가
            </motion.button>
            <div id="sample-dialogue-editor" hidden={!sampleOpen} inert={!sampleOpen}>
              <motion.div initial={false} animate={{ y: reduceMotion || sampleOpen ? 0 : '100%' }} transition={{ duration: reduceMotion ? 0 : 0.28, ease: [0.22, 1, 0.36, 1] }} style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', flexDirection: 'column', background: 'var(--color-bg)', margin: '0 auto', maxWidth: 'var(--app-w)' }}>
                <div style={{ display: 'flex', alignItems: 'center', minHeight: 56, padding: '0 var(--gutter)', flexShrink: 0 }}>
                  <button type="button" onClick={() => setSampleOpen(false)} aria-label="상황 예시 닫기"
                    style={{ display: 'grid', placeItems: 'center', width: 44, height: 44, marginLeft: -10, background: 'none', border: 0, cursor: 'pointer', color: 'var(--color-text-primary)' }}>
                    <svg aria-hidden width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
                  </button>
                  <h2 className="t-title-3" style={{ flex: 1, textAlign: 'center' }}>상황 예시</h2>
                  <button type="button" onClick={() => setSampleOpen(false)}
                    style={{ padding: '8px 4px', background: 'none', border: 0, cursor: 'pointer', color: 'var(--color-white)', fontSize: 'var(--font-body-size)', fontWeight: 'var(--weight-semibold)' }}>확인</button>
                </div>
                <div style={{ flex: 1, minHeight: 0, padding: '0 var(--gutter)' }}>
                  <DialogueEditor name="sampleDialogue" characterName={name} defaultValue={sampleDialogue(i.sampleDialogue)} onCharacterCountChange={setSampleCharacterCount} fill />
                </div>
              </motion.div>
            </div>
          </Section>
        </Panel>

        {/* ── 세계관 ── */}
        <Panel id="personality" show={tab === 'personality'}>
          <Section title="세계관">
            <Card>
              <LabeledField label="세계관 설명" hint="캐릭터가 살아가는 시대, 장소, 배경을 적어 주세요.">
                <CountedTextArea name="worldSetting" max={600} rows={4} defaultValue={i.worldSetting}
                  placeholder="예) 현대 서울. 도심의 경호업체를 중심으로 다양한 사건이 벌어진다." />
              </LabeledField>
            </Card>
          </Section>
          <input type="hidden" name="lore" value={JSON.stringify(i.lore)} />
          <Section title="장르" subtitle="여러 개를 고를 수 있어요. 최대 5개까지 선택하거나 직접 입력하면 검색 장르와 카드 해시태그에 반영됩니다.">
            <Card>
              <PresetTags name="mood" label="장르" options={MOODS} max={5} defaultValue={i.mood} />
            </Card>
          </Section>

        </Panel>

        {/* ── 외형 ── */}
        <Panel id="appearance" show={tab === 'appearance'}>
          <Section title="몸">
            <Card>
              <BodyPicker build={build} onBuild={setBuild} gender={gender} onGender={setGender} />
              <div className="stack" style={{ gap: 18, marginTop: 'var(--space-5)' }}>
                <LabeledField label="키"><CountedInput name="height" placeholder="예) 186cm" max={20} defaultValue={i.height} /></LabeledField>
                <LabeledField label="체형 설명"><CountedInput name="detail" placeholder="예) 어깨가 넓다" max={120} defaultValue={i.detail} /></LabeledField>
              </div>

              {/* 얼굴·머리는 고급 — 몸만 정해도 사진은 나온다. 접혀 있어도 칸은 DOM 에 남아 제출된다. */}
              <AdvancedToggle open={advanced} onToggle={() => setAdvanced((v) => !v)} controls="appearance-advanced" />
              <div id="appearance-advanced" hidden={!advanced}>
                <div className="stack" style={{ gap: 18, marginTop: 'var(--space-5)' }}>
                  <p className="t-body" style={{ fontWeight: 'var(--weight-semibold)' }}>얼굴</p>
                  <LabeledField label="눈"><CountedInput name="eyes" placeholder="예) 깊고 차가운 회청색 눈" max={80} defaultValue={i.eyes} /></LabeledField>
                  <Two>
                    <LabeledField label="코"><CountedInput name="nose" placeholder="예) 곧고 높은 콧대" max={80} defaultValue={i.nose} /></LabeledField>
                    <LabeledField label="턱"><CountedInput name="jaw" placeholder="예) 선이 분명한 턱" max={80} defaultValue={i.jaw} /></LabeledField>
                  </Two>
                  <LabeledField label="피부"><CountedInput name="skin" placeholder="예) 창백하고 건조한 피부" max={80} defaultValue={i.skin} /></LabeledField>
                  <LabeledField label="알아보게 하는 특징" hint="흉터, 점, 문신처럼 그 사람을 알아보게 하는 한 가지.">
                    <CountedInput name="distinctive" placeholder="예) 왼쪽 눈썹 끝을 가로지르는 오래된 흉터" max={100} defaultValue={i.distinctive} />
                  </LabeledField>

                  <p className="t-body" style={{ fontWeight: 'var(--weight-semibold)', marginTop: 'var(--space-2)' }}>머리 · 인상</p>
                  <Two>
                    <LabeledField label="머리 색"><CountedInput name="hairColor" placeholder="예) 어두운 갈색" max={40} defaultValue={i.hairColor} /></LabeledField>
                    <LabeledField label="머리 길이"><CountedInput name="hairLength" placeholder="예) 짧고 단정한" max={40} defaultValue={i.hairLength} /></LabeledField>
                  </Two>
                  <LabeledField label="머리 스타일"><CountedInput name="hairStyle" placeholder="예) 이마를 드러내게 넘긴" max={60} defaultValue={i.hairStyle} /></LabeledField>
                  <LabeledField label="평소 표정"><CountedInput name="expression" placeholder="예) 표정 변화가 거의 없다" max={120} defaultValue={i.expression} /></LabeledField>
                  <LabeledField label="스타일 태그" hint="옷차림·분위기. 사진 생성이 읽습니다.">
                    <TagInput name="styleTags" placeholder="예) 소매를 걷어 올린 셔츠" max={5} maxLength={40} defaultValue={i.styleTags} />
                  </LabeledField>
                </div>
              </div>
            </Card>
          </Section>
        </Panel>

        {/* ── 관계 ── */}
        <Panel id="relationship" show={tab === 'relationship'}>
          <Section title="시작 관계" subtitle="처음 어떤 사이인지 골라 주세요. 관계는 대화하며 달라져요.">
            <RelationshipSettings initial={i} />
          </Section>
        </Panel>

        <Panel id="contact" show={tab === 'contact'}>
          <Section title="일상·연락">
            <ContactSettings initial={i} mode={mode} capabilities={capabilities} />
          </Section>
        </Panel>

        {/* ── 상황 — 탭 아래 카드가 아니라 채팅 편집 화면이 전체로 열린다. 칸은 닫혀도 DOM 에 남는다. ── */}
        <Panel id="intro" show={tab === 'intro'}>
          <motion.div initial={false} animate={{ y: reduceMotion || tab === 'intro' ? 0 : '100%' }} transition={{ duration: reduceMotion ? 0 : 0.28, ease: [0.22, 1, 0.36, 1] }} style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', flexDirection: 'column', background: 'var(--color-bg)', margin: '0 auto', maxWidth: 'var(--app-w)' }}>
            <div style={{ display: 'flex', alignItems: 'center', minHeight: 56, padding: '0 var(--gutter)', flexShrink: 0 }}>
              <button type="button" onClick={() => openTab(prevTab)} aria-label="닫기"
                style={{ display: 'grid', placeItems: 'center', width: 44, height: 44, marginLeft: -10, background: 'none', border: 0, cursor: 'pointer', color: 'var(--color-text-primary)' }}>
                <svg aria-hidden width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
              </button>
              <h2 className="t-title-3" style={{ flex: 1, textAlign: 'center' }}>인트로 대화</h2>
              <button type="button" onClick={() => openTab(prevTab)} aria-label="인트로 확인"
                style={{ display: 'grid', placeItems: 'center', width: 44, height: 44, padding: 0, background: 'none', border: 0, cursor: 'pointer', color: 'var(--color-white)' }}>
                <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 4 4L19 6" /></svg>
              </button>
            </div>
            <div style={{ flex: 1, minHeight: 0, padding: '0 var(--gutter)' }}>
              <DialogueEditor name="introDialogue" intro characterName={name} defaultValue={introDialogue(i.sampleDialogue)} fill
                header={
                  <div style={{ padding: '14px 0 6px' }}>
                    <LabeledField label="첫 장면" required hint="대화가 시작되는 배경이에요. 아래 인트로는 새 채팅에 실제 메시지로 표시됩니다.">
                      <ControlledArea name="startingContext" value={startingContext} onChange={setStartingContext} max={600} rows={3}
                        placeholder="비 내리는 저녁, 당신은 의뢰 때문에 그의 공방을 처음 찾았다." />
                    </LabeledField>
                  </div>
                } />
              <input type="hidden" name="startingTime" value={i.startingTime} />
            </div>
          </motion.div>
        </Panel>

        {/* ── 소개 페이지 ── */}
        <Panel id="preview" show={tab === 'preview'}>
          <div style={{ marginTop: 20 }}><ChoiceChips value={previewMode} onChange={setPreviewMode} options={[{ value: 'detail', label: '소개 페이지' }, { value: 'chat', label: '첫 대화' }]} /></div>
          {previewMode === 'detail' ? <DetailPreview d={snap} can={capabilities} /> : <div aria-label="첫 대화 미리보기" style={{ marginTop: 24 }}>
            <p className="t-caption" style={{ color: 'var(--color-text-secondary)', marginBottom: 20 }}>새 대화를 시작할 때 이렇게 보여요.</p>
            {snap && introDialogue(snap.settings.character.sampleDialogue).map((turn, n) => <div key={n} style={{ marginBottom: 16, whiteSpace: 'pre-wrap' }}>
              {turn.role === 'character' && <p className="t-caption" style={{ marginBottom: 6 }}>{snap.name || '캐릭터'}</p>}
              <p className="t-body" style={{ padding: turn.role === 'character' ? 14 : 0, borderRadius: 12, background: turn.role === 'character' ? 'var(--color-surface-2)' : undefined, color: turn.role === 'narrator' ? 'var(--color-text-secondary)' : undefined }}>{turn.text}</p>
            </div>)}
            {snap && introDialogue(snap.settings.character.sampleDialogue).length === 0 && <p className="t-caption" style={{ color: 'var(--color-text-secondary)' }}>작성한 인트로 메시지가 없어요. 인트로에서 첫 대사를 추가할 수 있어요.</p>}
          </div>}
        </Panel>

      </form>
    </main>
  )
}

/** 탭 패널. 감춰도 DOM 에 남긴다 — 값이 살아 있어야 한 번에 제출된다. */
function Panel({ id, show, children }: { id: string; show: boolean; children: React.ReactNode }) {
  return <div id={`panel-${id}`} role="tabpanel" hidden={!show} inert={!show}>{children}</div>
}

/** 섹션 — 제목은 카드 바깥. */
function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section style={{ marginTop: 'var(--space-6)' }}>
      <h2 className="t-title-3" style={{ marginBottom: subtitle ? 4 : 12 }}>{title}</h2>
      {subtitle && <p className="t-caption" style={{ color: 'var(--color-text-tertiary)', marginBottom: 12 }}>{subtitle}</p>}
      {children}
    </section>
  )
}

/** 섹션의 칸 묶음. 판(배경)은 두지 않는다 — 입력칸과 버튼이 각자 면을 갖고 있어 페이지 바닥 위에 바로 놓인다. */
function Card({ children }: { children: React.ReactNode }) {
  return <div>{children}</div>
}

/** 이름·소개·설명만 따로 묶는 판 — 카드의 핵심 정보라 다른 필드와 시각적으로 구분한다. */
function IdentityCard({ children }: { children: React.ReactNode }) {
  return <div style={{ background: 'var(--color-surface-1)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-4)' }}>{children}</div>
}

/** '고급 설정' 접기 버튼 — 카드 아래 전체 너비. 열리면 화살표가 뒤집힌다. 접힌 내용은 hidden 으로만 감춰 제출에 포함된다. */
function AdvancedToggle({ open, onToggle, controls }: { open: boolean; onToggle: () => void; controls: string }) {
  return (
    <button type="button" aria-expanded={open} aria-controls={controls} onClick={onToggle}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%',
        minHeight: 52, marginTop: 'var(--space-5)', padding: '14px 16px', borderRadius: 'var(--radius-button)',
        background: 'var(--color-surface-3)', border: 0, cursor: 'pointer',
        color: 'var(--color-text-primary)', fontSize: 'var(--font-body-size)',
      }}>
      고급 설정
      <svg aria-hidden width="16" height="16" viewBox="0 0 16 16" fill="none"
        style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform var(--motion-fast) var(--ease-standard)' }}>
        <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  )
}

/** 좌우 두 칸. 1fr 은 최소 폭이 입력 고유 폭에 잡혀 오른쪽 칸이 카드를 넘친다 — minmax(0,1fr) 로 눌러야 한다. */
function Two({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 12 }}>{children}</div>
}

/** 값을 바깥이 들고 있는 한 줄 입력 (필수 판정용). 밑줄만, 상자 없음. */
function Controlled({ name, placeholder, max, value, onChange, big }: {
  name: string; placeholder: string; max: number; value: string; onChange: (v: string) => void; big?: boolean
}) {
  const [focused, setFocused] = useState(false)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', ...box(focused) }}>
      <input name={name} value={value} onChange={(e) => onChange(e.target.value)} maxLength={max}
        onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} placeholder={placeholder} autoComplete="off"
        style={{ flex: 1, minWidth: 0, background: 'none', border: 0, outline: 'none', color: 'var(--color-text-primary)', fontSize: 14 }} />
      {value.length >= max * 0.8 && <span className="t-micro" style={{ textTransform: 'none', letterSpacing: 0, color: value.length >= max ? 'var(--color-danger)' : 'var(--color-text-tertiary)' }}>{value.length}/{max}</span>}
    </div>
  )
}

function ControlledArea({ name, placeholder, max, rows, value, onChange }: {
  name: string; placeholder: string; max: number; rows: number; value: string; onChange: (v: string) => void
}) {
  const [focused, setFocused] = useState(false)
  return (
    <div style={{ padding: '6px 10px 3px', ...box(focused) }}>
      <textarea name={name} value={value} onChange={(e) => onChange(e.target.value)} maxLength={max} rows={rows} placeholder={placeholder}
        onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
        style={{ width: '100%', background: 'none', border: 0, outline: 'none', resize: 'none', color: 'var(--color-text-primary)', fontSize: 14, lineHeight: 1.5, fontFamily: 'inherit' }} />
      <div style={{ display: 'flex', justifyContent: 'flex-end', minHeight: 14 }}>
        {value.length >= max * 0.8 && <span className="t-micro" style={{ textTransform: 'none', letterSpacing: 0, color: value.length >= max ? 'var(--color-danger)' : 'var(--color-text-tertiary)' }}>{value.length}/{max}</span>}
      </div>
    </div>
  )
}

/** 성별·체형 — 낱말이 아니라 사진에서 고른다. 네 장은 같은 옷·배경·거리라 체형만 다르다. */
function BodyPicker({ build, onBuild, gender, onGender }: {
  build: string; onBuild: (b: string) => void; gender: string; onGender: (g: string) => void
}) {
  const reduce = useReducedMotion()
  return (
    <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
      <legend className="t-micro" style={{ textTransform: 'none', letterSpacing: 0, color: 'var(--color-text-tertiary)', marginBottom: 10 }}>성별 · 체형</legend>
      <ChoiceChips name="gender" value={gender} onChange={onGender} columns={2}
        options={GENDER_TYPES.map((g) => ({ value: g, label: GENDER_PRESETS[g].label }))} />
      <input type="hidden" name="build" value={build} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginTop: 'var(--space-4)' }}>
        {BUILD_TYPES.map((b) => {
          const on = b === build
          return (
            <motion.button key={b} type="button" onClick={() => onBuild(b)} aria-pressed={on}
              aria-label={`${GENDER_PRESETS[gender as keyof typeof GENDER_PRESETS]?.label} ${BUILD_PRESETS[b].label}`}
              whileTap={reduce ? undefined : { scale: 0.97 }}
              style={{ padding: 3, cursor: 'pointer', borderRadius: 'var(--radius-md)', background: 'none', border: `0.5px solid ${on ? 'var(--color-accent)' : 'transparent'}` }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/builds/${gender}-${b}.webp?v=7`} alt="" width={120} height={160} loading="lazy" decoding="async"
                style={{ width: '100%', aspectRatio: '3 / 4', objectFit: 'cover', display: 'block', borderRadius: 'var(--radius-sm)', opacity: on ? 1 : 0.5, transition: 'opacity var(--motion-fast) var(--ease-standard)' }} />
              <span className="t-micro" style={{ display: 'block', textAlign: 'center', textTransform: 'none', letterSpacing: 0, marginTop: 5, color: on ? 'var(--color-accent-text)' : 'var(--color-text-tertiary)' }}>{BUILD_PRESETS[b].label}</span>
            </motion.button>
          )
        })}
      </div>
    </fieldset>
  )
}


const REACTION_TRAITS = [
  { name: 'jealousy', label: '질투', choices: ['적음', '보통', '많음'], summaries: ['질투 적음', '질투 보통', '질투 많음'] },
  { name: 'initiative', label: '다가가는 방식', choices: ['기다림', '상황에 따라', '먼저'], summaries: ['수동', '유연', '주도'] },
  { name: 'emotionalExpression', label: '감정 표현', choices: ['절제함', '적당히', '솔직함'], summaries: ['표현 절제', '표현 보통', '표현 솔직'] },
] as const

function ReactionTraits({ initial }: { initial: FormInitial }) {
  const [open, setOpen] = useState(false)
  const [touched, setTouched] = useState<string[]>([])
  const reduceMotion = useReducedMotion()
  // Keep exact saved values until the user explicitly chooses a new level.
  const [values, setValues] = useState(() => ({
    jealousy: initial.jealousy,
    initiative: initial.initiative,
    emotionalExpression: initial.emotionalExpression,
  }))
  const level = (value: number) => value < 34 ? 0 : value > 66 ? 2 : 1
  const balanced = REACTION_TRAITS.every(({ name }) => level(values[name]) === 1)
  const summary = balanced ? '균형' : REACTION_TRAITS.map(({ name, summaries }) => summaries[level(values[name])]).join(' · ')
  return (
    <div className="stack" style={{ gap: 12, paddingTop: 20 }}>
      {REACTION_TRAITS.map(({ name }) => <input key={name} type="hidden" name={name} value={values[name]} />)}
      {touched.map(name => <input key={name} type="hidden" name="agencyExplicitField" value={`personality.${name}`} />)}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span className="t-body" style={{ flex: 1, minWidth: 0, fontWeight: 'var(--weight-semibold)' }}>반응 성향</span>
        <motion.button whileTap={reduceMotion ? undefined : { scale: 0.9 }} transition={{ type: 'spring', stiffness: 450, damping: 25 }} type="button" aria-label={open ? '반응 성향 편집 접기' : '반응 성향 편집'} aria-expanded={open} aria-controls="reaction-traits" onClick={() => setOpen((v) => !v)}
          style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, padding: 4, border: 0, borderRadius: 'var(--radius-sm)', background: 'rgba(255, 255, 255, 0.05)', color: 'var(--color-text-secondary)', cursor: 'pointer', flexShrink: 0 }}>
          <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <path d="m16 3 5 5M4 20l4.5-1L21 6.5a2.12 2.12 0 0 0-3-3L5.5 16 4 20Z" />
          </svg>
        </motion.button>
      </div>
      <p className="t-caption" style={{ color: 'var(--color-text-secondary)', marginTop: -8 }}>{summary}</p>
      <div id="reaction-traits" hidden={!open}>
        <div className="stack" style={{ gap: 16 }}>
          {REACTION_TRAITS.map(({ name, label, choices }) => (
            <fieldset key={name} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
              <legend className="t-body" style={{ marginBottom: 8, fontWeight: 'var(--weight-semibold)' }}>{label}</legend>
              <ChoiceChips columns={3} value={String(level(values[name]))}
                options={choices.map((label, index) => ({ value: String(index), label }))}
                onChange={(value) => {
                  setTouched(previous => previous.includes(name) ? previous : [...previous, name])
                  setValues((previous) => ({ ...previous, [name]: [20, 50, 80][Number(value)] }))
                }} />
            </fieldset>
          ))}
        </div>
      </div>
    </div>
  )
}
