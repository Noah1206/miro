/** Only a deliberate contact opt-in upgrades an existing chat character.
 * Turning contact off never removes already available Reality features.
 * The current type must come from the owned database row, not form data.
 */
export function characterExperience(enabled: boolean, current?: 'chat' | 'reality', optIn = false): 'chat' | 'reality' {
  if (!current) return enabled ? 'reality' : 'chat'
  return enabled && optIn ? 'reality' : current
}
