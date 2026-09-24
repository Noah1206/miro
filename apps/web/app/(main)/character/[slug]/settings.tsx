import { features } from '@miro/config'
import { db, contactProfiles, characterVisualIdentities } from '@miro/db'
import { and, desc, eq } from 'drizzle-orm'
import { CharacterSettingsView } from './settings-view'

/** Called only after the detail page has checked character visibility. */
export async function CharacterSettings({ characterId, name }: { characterId: string; name: string }) {
  const [[visual], [contact]] = await Promise.all([
    db.select().from(characterVisualIdentities).where(and(eq(characterVisualIdentities.characterId, characterId), eq(characterVisualIdentities.isActive, true))).orderBy(desc(characterVisualIdentities.version)).limit(1),
    db.select().from(contactProfiles).where(eq(contactProfiles.characterId, characterId)).limit(1),
  ])
  return <CharacterSettingsView visual={visual} contact={contact} name={name} can={features()} />
}
