import { readFileSync } from 'node:fs'

const source = readFileSync(process.argv[2] ?? 0, 'utf8')
const groups = new Map()

for (const line of source.split(/\r?\n/)) {
  const opening = line.indexOf('{')
  if (opening < 0) continue
  let record
  try { record = JSON.parse(line.slice(opening)) } catch { continue }
  if (record.event !== 'perf.metric' || typeof record.name !== 'string' || !Number.isFinite(record.elapsedMs) || record.elapsedMs < 0) continue
  const group = groups.get(record.name) ?? { values: [], errors: 0 }
  group.values.push(record.elapsedMs)
  if (record.ok === false) group.errors++
  groups.set(record.name, group)
}

if (groups.size === 0) {
  process.stderr.write('No perf.metric samples found. Set PERF_SAMPLE_RATE=1 during the benchmark.\n')
  process.exitCode = 1
} else {
  const report = Object.fromEntries([...groups].sort(([left], [right]) => left.localeCompare(right)).map(([name, group]) => {
    const values = group.values.sort((left, right) => left - right)
    const percentile = fraction => values[Math.max(0, Math.ceil(values.length * fraction) - 1)]
    return [name, {
      count: values.length,
      errors: group.errors,
      p50Ms: percentile(0.5),
      p95Ms: percentile(0.95),
      p99Ms: percentile(0.99),
      minMs: values[0],
      maxMs: values.at(-1),
    }]
  }))
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
}
