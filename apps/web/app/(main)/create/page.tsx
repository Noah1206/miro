import { feature } from '@miro/config'
import { CharacterForm } from './character-form'
import { saveCharacter } from './actions'

/** 고급 만들기 (명세서 2.2). 폼은 편집과 공용 — character-form.tsx. */
export default function CreatePage() {
  return <CharacterForm mode="create" action={saveCharacter} closeHref="/home" capabilities={{ message: feature('realityMessage'), photo: feature('imageGeneration'), voiceCall: feature('voiceCall') }} />
}
