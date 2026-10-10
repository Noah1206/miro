/** Display-only paragraph editing. Never changes the character's stored settings or prompt. */
export function editorialLines(text: string): string[] {
  return text.split('\n').flatMap((line) => {
    if (/^\s*\[.+\]\s*$/.test(line) || /\*[^*\n]+\*/.test(line)) return [line]
    // A supporting cast is already an explicit list, separated with spaced slashes.
    if (line.includes(' / ')) return line.split(' / ').flatMap((part, i) => i ? ['', part] : [part])
    if (line.length <= 110) return [line]
    const sentences: string[] = []
    const closes: string[] = []
    const pairs: Record<string, string> = { '(': ')', '[': ']', '「': '」', '『': '』', '“': '”' }
    let start = 0
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]!
      if (ch === closes.at(-1)) closes.pop()
      else if (pairs[ch]) closes.push(pairs[ch]!)
      else if (ch === '"') closes.push('"')
      if (!closes.length && /[.!?。！？]/.test(ch) && (i === line.length - 1 || /\s/.test(line[i + 1]!))) {
        sentences.push(line.slice(start, i + 1).trim())
        start = i + 1
      }
    }
    if (line.slice(start).trim()) sentences.push(line.slice(start).trim())
    const paragraphs: string[] = []
    let paragraph = ''
    let count = 0
    for (const sentence of sentences) {
      if (paragraph && (count >= 2 || paragraph.length + sentence.length > 100)) {
        paragraphs.push(paragraph)
        paragraph = ''
        count = 0
      }
      paragraph += (paragraph ? ' ' : '') + sentence
      count++
    }
    if (paragraph) paragraphs.push(paragraph)
    // Keep a bullet's continuation in its own indented block.
    if (/^\s*[·•-]\s/.test(line)) return [paragraphs.join('\n')]
    return paragraphs.flatMap((part, i) => i ? ['', part] : [part])
  })
}

export function editorialHeading(label: string): { icon: string; tone: 'brand' | 'mint' } {
  if (/당신|관계|you|relationship/i.test(label)) return { icon: '💬', tone: 'mint' }
  if (/세계|world/i.test(label)) return { icon: '🌙', tone: 'brand' }
  if (/주변|인물|people|cast/i.test(label)) return { icon: '🔗', tone: 'mint' }
  if (/프로필|profile/i.test(label)) return { icon: '🪪', tone: 'brand' }
  if (/겉으로|성격|personality/i.test(label)) return { icon: '✦', tone: 'brand' }
  return { icon: '✦', tone: 'brand' }
}
