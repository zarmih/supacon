import { performance } from 'node:perf_hooks'
import { createServer } from 'vite'

async function runBenchmark() {
  const server = await createServer({
    configFile: false,
    server: { middlewareMode: true },
  })

  const { emptyDatabase } = await server.ssrLoadModule('./src/store/defaults.ts')
  const { normalizeDatabase } = await server.ssrLoadModule('./src/store/storage.ts')
  const { filterJournalEvents } = await server.ssrLoadModule('./src/domain/journal.ts')
  const { csvFile } = await server.ssrLoadModule('./src/domain/csv.ts')
  const { formatDiary } = await server.ssrLoadModule('./src/domain/diary.ts')
  const { addDays, localDate } = await server.ssrLoadModule('./src/domain/time.ts')

  await server.close()

  const TRIGGERS = ['instagram', 'youtube', 'telegram', 'other']
  const SEEKINGS = ['boredom', 'validation', 'information', 'habit', 'relief', 'other']
  const CHOICES = ['open', 'postpone', 'close']
  const FEELINGS = ['anxious', 'tired', 'restless', 'curious', 'bored', 'lonely', 'excited']

  function generateDatabase(count, baseDate = new Date('2026-11-18T14:00:00Z')) {
    const db = emptyDatabase()
    db.startedOn = addDays(localDate(baseDate), -Math.min(count, 365))
    db.triggers = [
      { id: 'instagram', label: 'Instagram', preset: true },
      { id: 'youtube', label: 'YouTube', preset: true },
      { id: 'telegram', label: 'Telegram', preset: true },
      { id: 'other', label: 'Other', preset: true },
    ]

    for (let i = 0; i < count; i++) {
      // distribute events over the last 365 days
      const daysAgo = Math.floor((i / count) * 365)
      const eventDate = addDays(localDate(baseDate), -daysAgo)
      const triggerId = TRIGGERS[i % TRIGGERS.length]
      const seeking = SEEKINGS[i % SEEKINGS.length]
      const choice = CHOICES[i % CHOICES.length]
      const feelingBefore = FEELINGS[i % FEELINGS.length]

      db.events.push({
        id: `pause-bench-${i + 1}`,
        at: `${eventDate}T${String(10 + (i % 10)).padStart(2, '0')}:15:00.000Z`,
        date: eventDate,
        intent: 'browse',
        triggerId,
        awarenessBefore: ((i % 10) + 1),
        feelingBefore,
        seeking,
        seekingNote: seeking === 'other' ? `custom reason note ${i}` : '',
        choice,
        awarenessAfter: (((i + 3) % 10) + 1),
        feelingAfter: 'grounded and clear',
        overLimit: i % 7 === 0,
        elapsedSeconds: 10 + (i % 50),
        dayNumber: Math.min(daysAgo + 1, 7),
        phase: 'practice',
      })
    }

    return db
  }

  function measure(fn, iterations = 50) {
    // Warm-up
    for (let i = 0; i < 5; i++) fn()
    const start = performance.now()
    for (let i = 0; i < iterations; i++) {
      fn()
    }
    const end = performance.now()
    return (end - start) / iterations
  }

  const counts = [100, 1000, 5000]
  const results = []

  const referenceDate = new Date('2026-11-18T14:00:00Z')

  for (const count of counts) {
    const db = generateDatabase(count, referenceDate)
    const serialized = JSON.stringify(db)
    const byteSize = Buffer.byteLength(serialized, 'utf8')
    const charLength = serialized.length
    const kb = (byteSize / 1024).toFixed(1)
    const mb = (byteSize / (1024 * 1024)).toFixed(3)

    // 1. Load / Parse
    const loadTimeMs = measure(() => {
      const parsed = JSON.parse(serialized)
      normalizeDatabase(parsed)
    }, count === 5000 ? 30 : 50)

    // 2. Filter: All
    const filterAllMs = measure(() => {
      filterJournalEvents(db.events, null, 'all', referenceDate)
    }, 50)

    // 3. Filter: Trigger 'instagram'
    const filterTriggerMs = measure(() => {
      filterJournalEvents(db.events, 'instagram', 'all', referenceDate)
    }, 50)

    // 4. Filter: Period 'this-week'
    const filterThisWeekMs = measure(() => {
      filterJournalEvents(db.events, null, 'this-week', referenceDate)
    }, 50)

    // 5. Filter: Period '7d'
    const filter7dMs = measure(() => {
      filterJournalEvents(db.events, null, '7d', referenceDate)
    }, 50)

    // 6. Filter: Combined ('7d' + 'instagram')
    const filterCombinedMs = measure(() => {
      filterJournalEvents(db.events, 'instagram', '7d', referenceDate)
    }, 50)

    // 7. Export: JSON
    const exportJsonMs = measure(() => {
      JSON.stringify(db, null, 2)
    }, count === 5000 ? 20 : 50)

    // 8. Export: CSV
    const exportCsvMs = measure(() => {
      csvFile(db)
    }, count === 5000 ? 20 : 50)

    // 9. Export: Diary Markdown
    const exportDiaryMs = measure(() => {
      formatDiary(db, 'en')
    }, count === 5000 ? 20 : 50)

    results.push({
      count,
      sizeBytes: byteSize,
      sizeKb: kb,
      sizeMb: mb,
      loadTimeMs: Number(loadTimeMs.toFixed(3)),
      filterAllMs: Number(filterAllMs.toFixed(3)),
      filterTriggerMs: Number(filterTriggerMs.toFixed(3)),
      filterThisWeekMs: Number(filterThisWeekMs.toFixed(3)),
      filter7dMs: Number(filter7dMs.toFixed(3)),
      filterCombinedMs: Number(filterCombinedMs.toFixed(3)),
      exportJsonMs: Number(exportJsonMs.toFixed(3)),
      exportCsvMs: Number(exportCsvMs.toFixed(3)),
      exportDiaryMs: Number(exportDiaryMs.toFixed(3)),
    })
  }

  console.log('\n=== JOURNAL SCALABILITY BENCHMARK (Node.js / V8) ===\n')
  console.table(
    results.map((r) => ({
      Records: r.count,
      'Size (KB)': `${r.sizeKb} KB`,
      'Size (MB)': `${r.sizeMb} MB`,
      'Load (ms)': `${r.loadTimeMs} ms`,
      'Filter All (ms)': `${r.filterAllMs} ms`,
      'Filter 7d (ms)': `${r.filter7dMs} ms`,
      'Filter Trig+7d (ms)': `${r.filterCombinedMs} ms`,
      'Export JSON (ms)': `${r.exportJsonMs} ms`,
      'Export CSV (ms)': `${r.exportCsvMs} ms`,
      'Export Diary (ms)': `${r.exportDiaryMs} ms`,
    })),
  )

  console.log('\nDetailed JSON Output:\n', JSON.stringify(results, null, 2))
}

runBenchmark().catch((err) => {
  console.error(err)
  process.exit(1)
})
