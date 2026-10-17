import type { Database, EveningReview, PauseEvent } from './types'
import { dayNumber, phaseFor, intentionId } from './protocol'
import { buildInsights } from './insights'
import { addDays } from './time'
import { dictionary } from '../i18n'

function formatTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const h = String(d.getHours()).padStart(2, '0')
  const m = String(d.getMinutes()).padStart(2, '0')
  return `${h}:${m}`
}

function getAllDates(db: Database): string[] {
  const dates = new Set<string>()
  for (const e of db.events) dates.add(e.date)
  for (const m of db.mornings) dates.add(m.date)
  for (const ev of db.evenings) dates.add(ev.date)
  for (const f of db.focuses) dates.add(f.date)
  for (const d of db.dayMarks) dates.add(d.date)
  for (const mi of db.misses) dates.add(mi.date)

  if (db.startedOn) {
    dates.add(db.startedOn)
  }

  if (dates.size === 0) return []

  const sorted = [...dates].sort()
  const first = sorted[0]
  const last = sorted[sorted.length - 1]
  if (!first || !last) return []

  const result: string[] = []
  let curr = first
  while (curr <= last) {
    result.push(curr)
    curr = addDays(curr, 1)
  }
  return result
}

function getTriggerName(db: Database, triggerId: string, dict: ReturnType<typeof dictionary>): string {
  const preset = (dict.triggers as Record<string, string>)[triggerId]
  if (preset) return preset
  const custom = db.triggers.find((t) => t.id === triggerId)
  return custom?.label ?? triggerId
}

function getImpulseName(seeking: string, dict: ReturnType<typeof dictionary>): string {
  const s = (dict.seekings as Record<string, string>)[seeking]
  if (s) return s
  const m = (dict.motives as Record<string, string>)[seeking]
  if (m) return m
  return seeking
}

function formatChoice(
  choice: string,
  overLimit: boolean,
  postponeMinutes: number | undefined,
  lang: 'en' | 'ru',
): string {
  if (lang === 'ru') {
    switch (choice) {
      case 'open':
        return overLimit ? 'Открыто сверх границы' : 'Открыто'
      case 'postpone':
        return postponeMinutes ? `Отложено на ${postponeMinutes} мин` : 'Отложено'
      case 'close':
        return 'Закрыто'
      case 'post':
        return 'Опубликовано'
      case 'draft':
        return 'Оставлен черновик'
      case 'dont-post':
        return 'Не опубликовано'
      default:
        return choice
    }
  } else {
    switch (choice) {
      case 'open':
        return overLimit ? 'Open past limit' : 'Open'
      case 'postpone':
        return postponeMinutes ? `Postponed for ${postponeMinutes} min` : 'Postponed'
      case 'close':
        return 'Closed'
      case 'post':
        return 'Posted'
      case 'draft':
        return 'Draft kept'
      case 'dont-post':
        return 'Not posted'
      default:
        return choice
    }
  }
}

function formatSessionResult(found: 'yes' | 'partly' | 'no' | undefined, lang: 'en' | 'ru'): string | null {
  if (!found) return null
  if (lang === 'ru') {
    switch (found) {
      case 'yes':
        return 'Да'
      case 'partly':
        return 'Частично'
      case 'no':
        return 'Нет'
    }
  } else {
    switch (found) {
      case 'yes':
        return 'Yes'
      case 'partly':
        return 'Partly'
      case 'no':
        return 'No'
    }
  }
}

function pluralPauses(n: number, lang: 'en' | 'ru'): string {
  if (lang === 'en') {
    return n === 1 ? 'pause' : 'pauses'
  }
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod100 >= 11 && mod100 <= 19) return 'пауз'
  if (mod10 === 1) return 'пауза'
  if (mod10 >= 2 && mod10 <= 4) return 'паузы'
  return 'пауз'
}

function formatEveningReview(evening: EveningReview, lang: 'en' | 'ru'): string[] {
  const items: string[] = []
  if (evening.lowestMoment && evening.lowestMoment.trim()) {
    items.push(
      lang === 'ru'
        ? `  - Самый тяжёлый момент: ${evening.lowestMoment.trim()}`
        : `  - Lowest moment: ${evening.lowestMoment.trim()}`,
    )
  }
  if (evening.note && evening.note.trim()) {
    items.push(
      lang === 'ru'
        ? `  - Заметка: ${evening.note.trim()}`
        : `  - Note: ${evening.note.trim()}`,
    )
  }
  if (evening.whereItBroke && evening.whereItBroke.trim()) {
    items.push(
      lang === 'ru'
        ? `  - Где ломался протокол: ${evening.whereItBroke.trim()}`
        : `  - Where protocol broke: ${evening.whereItBroke.trim()}`,
    )
  }
  if (evening.likesChanged) {
    const text =
      lang === 'ru'
        ? evening.likesChanged === 'yes'
          ? 'Да'
          : evening.likesChanged === 'no'
            ? 'Нет'
            : 'Не уверен'
        : evening.likesChanged === 'yes'
          ? 'Yes'
          : evening.likesChanged === 'no'
            ? 'No'
            : 'Unsure'
    const note = evening.likesNote ? ` (${evening.likesNote.trim()})` : ''
    items.push(
      lang === 'ru'
        ? `  - Ощущение от лайков изменилось: ${text}${note}`
        : `  - Feeling from likes changed: ${text}${note}`,
    )
  }
  if (evening.unloggedMisses > 0) {
    items.push(
      lang === 'ru'
        ? `  - Неучтённые пропуски: ${evening.unloggedMisses}`
        : `  - Unlogged misses: ${evening.unloggedMisses}`,
    )
  }
  return items
}

function formatPauseLine(
  event: PauseEvent,
  db: Database,
  dict: ReturnType<typeof dictionary>,
  lang: 'en' | 'ru',
): string {
  const parts: string[] = []
  parts.push(formatTime(event.at))
  parts.push(getTriggerName(db, event.triggerId, dict))

  if (event.awarenessAfter !== undefined && event.awarenessAfter !== event.awarenessBefore) {
    parts.push(
      lang === 'ru'
        ? `Осознанность: ${event.awarenessBefore} → ${event.awarenessAfter}/10`
        : `Awareness: ${event.awarenessBefore} → ${event.awarenessAfter}/10`,
    )
  } else {
    parts.push(
      lang === 'ru'
        ? `Осознанность: ${event.awarenessBefore}/10`
        : `Awareness: ${event.awarenessBefore}/10`,
    )
  }

  const impulse = getImpulseName(event.seeking, dict)
  const seekingDesc = event.seekingNote ? `${impulse} ("${event.seekingNote.trim()}")` : impulse
  parts.push(lang === 'ru' ? `Искание: ${seekingDesc}` : `Seeking: ${seekingDesc}`)

  const choiceDesc = formatChoice(event.choice, event.overLimit, event.postponeMinutes, lang)
  parts.push(lang === 'ru' ? `Выбор: ${choiceDesc}` : `Choice: ${choiceDesc}`)

  const session = db.sessions.find((s) => s.pauseId === event.id)
  const finish = event.finish || session?.finish
  if (finish && finish.trim()) {
    parts.push(lang === 'ru' ? `Финишная черта: "${finish.trim()}"` : `Finish line: "${finish.trim()}"`)
  }

  const result = formatSessionResult(session?.found, lang)
  if (result) {
    parts.push(lang === 'ru' ? `Результат сессии: ${result}` : `Session result: ${result}`)
  }

  return `- ${parts.join(' · ')}`
}

export function formatDiary(db: Database, lang: 'en' | 'ru'): string {
  const dict = dictionary(lang)
  const dates = getAllDates(db)
  const lines: string[] = []

  // 1. Header
  const title = lang === 'ru' ? '# Дневник практики Supacon' : '# Supacon Practice Diary'
  lines.push(title)
  lines.push('')

  let periodStr: string
  if (dates.length === 0) {
    periodStr = lang === 'ru' ? 'Нет записей' : 'No entries'
  } else if (dates.length === 1) {
    periodStr = dates[0] ?? ''
  } else {
    const sep = lang === 'ru' ? ' — ' : ' – '
    const firstDate = dates[0] ?? ''
    const lastDate = dates[dates.length - 1] ?? ''
    periodStr = `${firstDate}${sep}${lastDate}`
  }

  const periodLabel = lang === 'ru' ? 'Период практики' : 'Practice period'
  const totalPausesLabel = lang === 'ru' ? 'Всего пауз' : 'Total pauses'
  lines.push(`- **${periodLabel}:** ${periodStr}`)
  lines.push(`- **${totalPausesLabel}:** ${db.events.length}`)
  lines.push('')

  // 2. Days section
  if (dates.length === 0) {
    lines.push(`*${lang === 'ru' ? 'Нет записей практики.' : 'No practice records yet.'}*`)
    lines.push('')
  } else {
    for (const date of dates) {
      lines.push('---')
      lines.push('')

      const dayNum = dayNumber(db.startedOn, date)
      const phase = phaseFor(dayNum, db.practiceMode)
      if (dayNum !== null) {
        lines.push(`## ${dict.day(dayNum)} (${date}) · ${dict.phases[phase]}`)
      } else {
        lines.push(`## ${date}`)
      }
      lines.push('')

      // Intention & Morning
      const intentionKey = intentionId(dayNum, phase)
      const intention = dict.intentions[intentionKey]
      if (intention) {
        lines.push(
          lang === 'ru'
            ? `- **Утреннее намерение:** ${intention}`
            : `- **Daily intention:** ${intention}`,
        )
      }

      const morning = db.mornings.find((m) => m.date === date)
      if (morning) {
        const desire = morning.firstDesire ? ` · ${lang === 'ru' ? 'Первое желание' : 'First desire'}: "${morning.firstDesire.trim()}"` : ''
        lines.push(
          lang === 'ru'
            ? `- **Утренний чек-ин:** Осознанность ${morning.awareness}/10${desire}`
            : `- **Morning check-in:** Awareness ${morning.awareness}/10${desire}`,
        )
      } else {
        lines.push(
          lang === 'ru'
            ? '- **Утренний чек-ин:** —'
            : '- **Morning check-in:** —',
        )
      }

      // Focus blocks
      const dayFocuses = db.focuses.filter((f) => f.date === date)
      if (dayFocuses.length > 0) {
        for (const focus of dayFocuses) {
          const timeRange = `${formatTime(focus.startedAt)}${focus.endedAt ? `–${formatTime(focus.endedAt)}` : ''}`
          const status = focus.completed
            ? (lang === 'ru' ? 'Завершён' : 'Completed')
            : (lang === 'ru' ? 'Прерван' : 'Interrupted')
          const minUnit = lang === 'ru' ? 'мин' : 'min'
          lines.push(
            lang === 'ru'
              ? `- **Фокус-блок:** ${timeRange} (${focus.plannedMinutes} ${minUnit}) · ${status}`
              : `- **Focus block:** ${timeRange} (${focus.plannedMinutes} ${minUnit}) · ${status}`,
          )
        }
      } else {
        lines.push(
          lang === 'ru'
            ? '- **Фокус-блок:** —'
            : '- **Focus block:** —',
        )
      }

      // Evening review
      const evening = db.evenings.find((e) => e.date === date)
      if (evening) {
        const eveningLines = formatEveningReview(evening, lang)
        if (eveningLines.length > 0) {
          lines.push(lang === 'ru' ? '- **Вечерний обзор:**' : '- **Evening review:**')
          for (const el of eveningLines) lines.push(el)
        } else {
          lines.push(
            lang === 'ru'
              ? '- **Вечерний обзор:** Заполнен (без заметок)'
              : '- **Evening review:** Recorded (no notes)',
          )
        }
      } else {
        lines.push(
          lang === 'ru'
            ? '- **Вечерний обзор:** —'
            : '- **Evening review:** —',
        )
      }

      // Day mark (real contact)
      const dayMark = db.dayMarks.find((m) => m.date === date)
      if (dayMark && dayMark.realContact !== null) {
        const contactVal = dayMark.realContact
          ? (lang === 'ru' ? 'Да' : 'Yes')
          : (lang === 'ru' ? 'Нет' : 'No')
        const noteVal = dayMark.contactNote ? ` ("${dayMark.contactNote.trim()}")` : ''
        lines.push(
          lang === 'ru'
            ? `- **Живой контакт:** ${contactVal}${noteVal}`
            : `- **Real contact:** ${contactVal}${noteVal}`,
        )
      }

      // Pauses list
      lines.push('')
      lines.push(`### ${lang === 'ru' ? 'Список пауз' : 'Pauses'}`)
      lines.push('')

      const dayEvents = db.events.filter((e) => e.date === date).sort((a, b) => a.at.localeCompare(b.at))
      const dayMisses = db.misses.filter((m) => m.date === date).sort((a, b) => a.at.localeCompare(b.at))

      if (dayEvents.length === 0 && dayMisses.length === 0) {
        lines.push(`*${lang === 'ru' ? 'В этот день пауз не зафиксировано.' : 'No pauses recorded for this day.'}*`)
      } else {
        for (const event of dayEvents) {
          lines.push(formatPauseLine(event, db, dict, lang))
        }
        for (const miss of dayMisses) {
          const missParts: string[] = []
          missParts.push(formatTime(miss.at))
          missParts.push(getTriggerName(db, miss.triggerId, dict))
          missParts.push(lang === 'ru' ? '[Пропуск без паузы]' : '[Missed pause]')
          if (miss.awareness) {
            missParts.push(
              lang === 'ru'
                ? `Осознанность: ${miss.awareness}/10`
                : `Awareness: ${miss.awareness}/10`,
            )
          }
          if (miss.seeking) {
            missParts.push(
              lang === 'ru'
                ? `Искание: ${getImpulseName(miss.seeking, dict)}`
                : `Seeking: ${getImpulseName(miss.seeking, dict)}`,
            )
          }
          if (miss.note && miss.note.trim()) {
            missParts.push(`"${miss.note.trim()}"`)
          }
          lines.push(`- ${missParts.join(' · ')}`)
        }
      }
      lines.push('')
    }
  }

  // 3. Summary Insights
  lines.push('---')
  lines.push('')
  lines.push(`## ${lang === 'ru' ? 'Итоговые инсайты' : 'Summary Insights'}`)
  lines.push('')

  if (db.events.length === 0) {
    lines.push(`*${lang === 'ru' ? 'Недостаточно данных для инсайтов.' : 'Not enough data for insights yet.'}*`)
    lines.push('')
  } else {
    const lastDate = (dates.length > 0 ? dates[dates.length - 1] : undefined) ?? '2000-01-01'
    const insights = buildInsights(db, lastDate)

    // Average awareness
    const avgAwarenessLabel = lang === 'ru' ? 'Средняя осознанность' : 'Average awareness'
    lines.push(
      `- **${avgAwarenessLabel}:** ${insights.avgAwareness !== null ? `${insights.avgAwareness.toFixed(1)} / 10` : '—'}`,
    )

    // Threshold
    const thresholdLabel = lang === 'ru' ? 'Порог осознанности' : 'Awareness threshold'
    if (insights.threshold) {
      lines.push(
        `- **${thresholdLabel}:** ${dict.insight.thresholdBody(
          insights.threshold.cut,
          Math.round(insights.threshold.openBelow * 100),
          Math.round(insights.threshold.openAbove * 100),
        )}`,
      )
    } else {
      lines.push(`- **${thresholdLabel}:** ${dict.insight.noThreshold}`)
    }

    // Dominant cycle
    const cycleLabel = lang === 'ru' ? 'Доминирующий цикл' : 'Dominant cycle'
    if (insights.cycle) {
      const cycleName = dict.cycles[insights.cycle.key]
      const countLabel = pluralPauses(insights.cycle.n, lang)
      lines.push(`- **${cycleLabel}:** ${cycleName} (${insights.cycle.n} ${countLabel})`)
    } else {
      lines.push(`- **${cycleLabel}:** ${lang === 'ru' ? 'Не выражен' : 'None dominant'}`)
    }

    // Wanting without liking
    if (insights.trained) {
      const trainedLabel = lang === 'ru' ? 'Желание без удовольствия' : 'Wanting without liking'
      lines.push(
        lang === 'ru'
          ? `- **${trainedLabel}:** ${insights.trained.unliked} из ${insights.trained.answered} сессий не принесли искомого`
          : `- **${trainedLabel}:** ${insights.trained.unliked} of ${insights.trained.answered} opens did not deliver what was sought`,
      )
    }

    // Unfinished opens
    if (insights.unfinished) {
      const unfinishedLabel = lang === 'ru' ? 'Открытия без финишной черты' : 'Opens without finish line'
      lines.push(
        lang === 'ru'
          ? `- **${unfinishedLabel}:** ${insights.unfinished.bare} из ${insights.unfinished.opens}`
          : `- **${unfinishedLabel}:** ${insights.unfinished.bare} of ${insights.unfinished.opens}`,
      )
    }

    // Intercept rate
    if (insights.interceptRate !== null) {
      const interceptLabel = lang === 'ru' ? 'Доля перехваченных пауз' : 'Intercept rate'
      const pct = Math.round(insights.interceptRate * 100)
      lines.push(
        lang === 'ru'
          ? `- **${interceptLabel}:** ${pct}% (отложено или закрыто)`
          : `- **${interceptLabel}:** ${pct}% (postponed or closed)`,
      )
    }

    lines.push('')
  }

  return lines.join('\n')
}
