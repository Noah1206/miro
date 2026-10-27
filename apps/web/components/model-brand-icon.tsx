/** Monochrome brand marks from Lobe Icons (MIT); see public/brand/ai/NOTICE.md. */
export function ModelBrandIcon({ brand, className }: { brand: string | null; className?: string }) {
  const source = brand === 'claude' || brand === 'openai' ? `/brand/ai/${brand}.svg` : null
  return source ? <span aria-hidden="true" className={className} style={{ display: 'inline-block', flexShrink: 0, width: '1em', height: '1em', backgroundColor: 'currentColor', mask: `url("${source}") center / contain no-repeat`, WebkitMask: `url("${source}") center / contain no-repeat` }}/> :
    <svg aria-hidden="true" className={className} width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><rect x="4" y="6" width="16" height="15" rx="4"/><path d="M12 2v4M8 11v4M16 11v4"/></svg>
}
