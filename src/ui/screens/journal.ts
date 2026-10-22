import { focusEndsAt, sessionEndsAt } from '../../domain/clock'
import { dayStats } from '../../domain/insights'
import { dayNumber, phaseFor } from '../../domain/protocol'
import { formatClock, localDate, addDays } from '../../domain/time'
import { SEEKINGS, type Database, type DayMark, type PauseEvent } from '../../domain/types'
import type { Dict } from '../../i18n'
import { activeFocus } from '../../store/mutate'
import { esc, field, formatAvg, impulseName, scoreGrid, triggerName } from '../html'
import type { ViewModel } from '../model'

export function morningScreen(view: ViewModel): string {
  const { dict } = view
  const guidance = dict.morning.guidance ?? dict.morningGuidance ?? dict.morning.body
  const breaths = dict.morning.breaths ?? dict.morningBreaths ?? '3 breaths'
  return `<section class="stack">
    <a class="text-btn" href="#/today">${esc(dict.back)}</a>
    <h1 id="step-title">${esc(dict.morning.title)}</h1>
    <div class="breath-pips" role="img" aria-label="${esc(breaths)}">
      <i class="breath-pip is-on"></i>
      <i class="breath-pip is-on"></i>
      <i class="breath-pip is-on"></i>
    </div>
    <p class="lede">${esc(guidance)}</p>
    ${scoreGrid(view.form.score, 'form-score', dict)}
    ${field('desire', dict.morning.desire, view.fields.desire ?? '', dict.morning.placeholder)}
    <button type="button" class="btn primary block" data-action="morning-save">${esc(dict.save)}</button>
  </section>`
}

function eveningContactBlock(mark: DayMark | undefined, isRu: boolean): string {
  const hasContact = mark?.realContact
  let statusText: string
  if (isRu) {
    statusText = hasContact === true ? 'был' : hasContact === false ? 'не было' : 'пока не отмечено'
  } else {
    statusText = hasContact === true ? 'happened' : hasContact === false ? 'not today' : 'not marked yet'
  }

  const label = isRu ? `Живой контакт сегодня: ${statusText}` : `Real contact today: ${statusText}`
  const note = mark?.contactNote?.trim()

  return `<article class="card contact-status-card" data-card="eveningContact">
    <p><strong>${esc(label)}</strong></p>
    ${note ? `<p class="muted" style="margin-top: 0.35rem;">${esc(note)}</p>` : ''}
  </article>`
}

export function eveningDaySummary(db: Database, today: string, dict: Dict): string {
  const stats = dayStats(db, today)
  const isRu = dict.save === 'Сохранить'
  const morning = db.mornings.find((entry) => entry.date === today)
  const focusCompleted = db.focuses.some((entry) => entry.date === today && entry.completed)
  const todayMisses = db.misses.filter((miss) => miss.date === today).length

  let morningText: string
  if (morning) {
    const desire = morning.firstDesire?.trim()
    if (isRu) {
      morningText = `Утренняя отметка: осознанность ${morning.awareness}${desire ? `, первое желание: «${desire}»` : ''}`
    } else {
      morningText = `Morning check-in: awareness ${morning.awareness}${desire ? `, first desire: "${desire}"` : ''}`
    }
  } else {
    morningText = isRu ? 'Утренняя отметка: не записана' : 'Morning check-in: not logged'
  }

  const pausesFn = dict.evening.eveningSummaryPauses ?? dict.evening.summaryPauses
  const pausesText = pausesFn
    ? pausesFn(stats.pauses, stats.opened, stats.closed, stats.postponed)
    : isRu
      ? `Пауз сегодня: ${stats.pauses} (открыто ${stats.opened}, закрыто ${stats.closed}, отложено ${stats.postponed})`
      : `Pauses today: ${stats.pauses} (opened ${stats.opened}, closed ${stats.closed}, postponed ${stats.postponed})`

  const avgFormatted = stats.avg !== null ? formatAvg(stats.avg) : isRu ? 'нет данных' : 'no data'
  const avgFn = dict.evening.eveningSummaryAvg ?? dict.evening.summaryAvg
  const avgText = avgFn
    ? avgFn(avgFormatted)
    : isRu
      ? `Средняя осознанность за день: ${avgFormatted}`
      : `Average awareness today: ${avgFormatted}`

  const focusFn = dict.evening.eveningSummaryFocus ?? dict.evening.summaryFocus
  const focusText = focusFn
    ? focusFn(focusCompleted)
    : isRu
      ? focusCompleted
        ? 'Блок фокуса: выполнен'
        : 'Блок фокуса: не выполнялся'
      : focusCompleted
        ? 'Focus block: completed'
        : 'Focus block: not completed'

  const missesText = dict.evening.loggedMissesToday
    ? dict.evening.loggedMissesToday(todayMisses)
    : isRu
      ? `Записано пропусков сегодня: ${todayMisses}`
      : `${todayMisses} misses logged today`

  const title = dict.evening.eveningSummaryTitle ?? dict.evening.summaryTitle ?? (isRu ? 'Фактура сегодняшнего дня' : 'Today’s factual record')

  return `<article class="card evening-summary-card" data-card="eveningDaySummary">
    <p class="kicker">${esc(title)}</p>
    <ul class="summary-list">
      <li>${esc(morningText)}</li>
      <li>${esc(pausesText)}</li>
      <li>${esc(avgText)}</li>
      <li>${esc(focusText)}</li>
      <li>${esc(missesText)}</li>
    </ul>
  </article>`
}

export function eveningScreen(view: ViewModel): string {
  const { db, dict, now } = view
  const today = localDate(new Date(now))
  const phase = phaseFor(dayNumber(db.startedOn, today), db.practiceMode)
  const diagnosis = phase === 'diagnosis'
  const todayMisses = db.misses.filter((miss) => miss.date === today).length
  const mark = db.dayMarks.find((entry) => entry.date === today)
  const showContact = phase === 'contrast' || Boolean(mark)
  const isRu = dict.save === 'Сохранить'
  return `<section class="stack">
    <a class="text-btn" href="#/today">${esc(dict.back)}</a>
    <h1 id="step-title">${esc(dict.evening.title)}</h1>
    ${eveningDaySummary(db, today, dict)}
    ${showContact ? eveningContactBlock(mark, isRu) : ''}
    ${field('lowest', dict.evening.lowest, view.fields.lowest ?? '', dict.evening.lowestPlaceholder)}
    ${field('note', dict.evening.note, view.fields.note ?? '', dict.evening.notePlaceholder, true)}
    <div class="setting">
      <div>
        <p id="unlogged-label">${esc(dict.evening.unlogged)}</p>
        <p class="muted">${esc(dict.evening.unloggedHelp)}</p>
        ${todayMisses > 0 ? `<p class="muted" style="margin-top: 0.25rem;">${esc(dict.evening.unloggedClarify)}</p><p class="muted" style="margin-top: 0.25rem;">${esc(dict.evening.totalMissesPreview(todayMisses, view.form.unlogged))}</p>` : ''}
      </div>
      <div class="stepper" role="group" aria-labelledby="unlogged-label">
        <button type="button" data-action="unlogged" data-dir="-1" aria-label="${esc(dict.a11y.decrease)}" aria-describedby="unlogged-value">−</button>
        <span id="unlogged-value">${view.form.unlogged}</span>
        <button type="button" data-action="unlogged" data-dir="1" aria-label="${esc(dict.a11y.increase)}" aria-describedby="unlogged-value">+</button>
      </div>
    </div>
    ${
      diagnosis
        ? `<fieldset class="choice-list">
            <legend>${esc(dict.evening.likes)}</legend>
            ${(['yes', 'no', 'unsure'] as const)
              .map((value) => {
                const label = value === 'yes' ? dict.evening.likesYes : value === 'no' ? dict.evening.likesNo : dict.evening.likesUnsure
                const on = view.form.likes === value
                return `<button type="button" class="choice${on ? ' is-on' : ''}" data-action="likes" data-value="${value}" aria-pressed="${on}">${esc(label)}</button>`
              })
              .join('')}
          </fieldset>
          ${field('likes-note', dict.evening.likesNote, view.fields['likes-note'] ?? '', dict.evening.likesNote)}
          ${field('broke', dict.evening.broke, view.fields.broke ?? '', dict.evening.brokePlaceholder, true)}`
        : ''
    }
    <button type="button" class="btn primary block" data-action="evening-save">${esc(dict.save)}</button>
  </section>`
}

export function focusScreen(view: ViewModel): string {
  const { db, dict, now } = view
  const running = activeFocus(db)
  if (!running) {
    const today = localDate(new Date(now))
    const done = db.focuses.find((entry) => entry.date === today && entry.endedAt)
    return `<section class="stack ritual">
      <a class="text-btn" href="#/today">${esc(dict.back)}</a>
      <h1 id="step-title">${esc(dict.focus.title)}</h1>
      <p class="lede">${esc(dict.focus.body)}</p>
      <p class="muted">${esc(dict.focus.room)}</p>
      ${done ? `<p class="flash">${esc(done.completed ? dict.focus.doneTitle : dict.focus.earlyTitle)} ${esc(dict.focus.logged(done.plannedMinutes))}</p>` : ''}
      <button type="button" class="btn primary block" data-action="focus-start">${esc(done ? dict.focus.another : dict.focus.start(db.settings.focusMinutes))}</button>
    </section>`
  }
  const remain = focusEndsAt(running) - now
  const finished = remain <= 0
  return `<section class="stack ritual">
    <a class="text-btn" href="#/today">${esc(dict.back)}</a>
    <p class="kicker">${esc(dict.home.focusTodo)}</p>
    <h1 id="step-title">${esc(finished ? dict.focus.doneTitle : dict.focus.title)}</h1>
    <p class="timer" data-clock="remain" data-until="${focusEndsAt(running)}">${formatClock(Math.max(0, remain))}</p>
    <p class="muted">${esc(dict.focus.room)}</p>
    <div class="choice-list">
      <button type="button" class="choice" data-action="focus-end" data-value="done">${esc(dict.focus.finish)}</button>
      <button type="button" class="choice" data-action="focus-end" data-value="early">${esc(dict.focus.stop)}</button>
    </div>
  </section>`
}

function sessionFinishBlock(finish: string | undefined, isRu: boolean): string {
  if (finish && finish.trim()) {
    const title = isRu ? `Финишная черта: ${finish.trim()}` : `Finish line: ${finish.trim()}`
    const hint = isRu
      ? 'Лента не имеет естественного конца. Ты здесь ради этой границы.'
      : 'The feed has no ending. You are here for this boundary.'
    return `<article class="card finish-reminder-card" data-card="sessionFinish">
      <p><strong>${esc(title)}</strong></p>
      <p class="muted" style="margin-top: 0.35rem;">${esc(hint)}</p>
    </article>`
  }
  const noFinishText = isRu
    ? 'Граница не была названа. Заметь, когда будет достаточно.'
    : 'No finish line was named. Notice when enough is reached.'
  return `<p class="muted session-no-finish" data-card="sessionNoFinish">${esc(noFinishText)}</p>`
}

export function sessionScreen(view: ViewModel): string {
  const { db, dict, now } = view
  const route = view.route
  if (route.name !== 'session') return ''
  const session = db.sessions.find((item) => item.id === route.id)
  if (!session || session.endedAt) {
    return `<section class="stack"><h1 id="step-title">${esc(dict.session.missing)}</h1><a class="btn" href="#/today">${esc(dict.nav.today)}</a></section>`
  }
  const isRu = dict.save === 'Сохранить'
  const remain = sessionEndsAt(session) - now
  const up = remain <= 0
  const name = triggerName(db, session.triggerId, dict)
  const seeking = impulseName(session.seeking, dict)
  const ask = up || view.form.pendingEnd
  const extendLabel = isRu
    ? `Продлить сессию (+${db.settings.sessionMinutes} мин)`
    : `Extend session (+${db.settings.sessionMinutes} min)`
  return `<section class="stack ritual">
    <a class="text-btn" href="#/today">${esc(dict.back)}</a>
    <p class="kicker">${esc(name)}</p>
    <h1 id="step-title">${esc(up ? dict.session.up : dict.home.sessionRunning)}</h1>
    <p class="timer" data-clock="remain" data-until="${sessionEndsAt(session)}">${formatClock(Math.max(0, remain))}</p>
    <p class="muted">${esc(dict.session.of(session.plannedMinutes + session.extendedMinutes))}</p>
    <p class="context">${esc(dict.session.started(session.awarenessAtStart, seeking))}</p>
    ${session.finish ? `<p class="lede">${esc(dict.session.enough(session.finish))}</p>` : ''}
    ${
      session.extendedMinutes > 0
        ? `<p class="muted note">${esc(
            isRu
              ? `Продлено: +${session.extendedMinutes} мин. Дополнительный слот не расходуется.`
              : `Extended: +${session.extendedMinutes} min. Additional slot is not used.`,
          )}</p>`
        : ''
    }
    ${sessionFinishBlock(session.finish, isRu)}
    ${
      session.overLimit
        ? `<p class="overlimit-note">${esc(
            dict.session?.over ??
              (dict.save === 'Сохранить'
                ? 'Сессия сверх лимита. Записана честно, как есть. Приложение не блокирует и не осуждает.'
                : 'Session over the limit. Logged honestly, as it is. The app does not block or judge.'),
          )}</p>`
        : ''
    }
    ${
      ask
        ? `<p class="lede">${esc(dict.session.question)}</p>
           <div class="choice-list">
             <button type="button" class="choice" data-action="session-end" data-found="yes">${esc(dict.session.yes)}</button>
             <button type="button" class="choice" data-action="session-end" data-found="partly">${esc(dict.session.partly)}</button>
             <button type="button" class="choice" data-action="session-end" data-found="no">${esc(dict.session.no)}</button>
             ${up ? `<button type="button" class="choice" data-action="session-extend">${esc(extendLabel)}</button>` : ''}
           </div>`
        : `<button type="button" class="btn block" data-action="ask-end">${esc(dict.session.end)}</button>`
    }
  </section>`
}

export function missScreen(view: ViewModel): string {
  const { db, dict } = view
  const triggers = db.triggers.some((t) => t.enabled) ? db.triggers.filter((t) => t.enabled) : db.triggers
  return `<section class="stack">
    <a class="text-btn" href="#/today">${esc(dict.back)}</a>
    <h1 id="step-title">${esc(dict.miss.title)}</h1>
    <p class="lede">${esc(dict.miss.body)}</p>

    <div class="field">
      <span class="kicker">${esc(dict.miss.triggerKicker)}</span>
      <div class="chips" role="group" aria-label="${esc(dict.miss.triggerKicker)}">
        ${triggers
          .map((trigger) => {
            const on = view.fields.trigger === trigger.id
            return `<button type="button" class="chip${on ? ' is-on' : ''}" data-action="miss-trigger" data-value="${esc(trigger.id)}" aria-pressed="${on}">${esc(triggerName(db, trigger.id, dict))}</button>`
          })
          .join('')}
      </div>
    </div>

    <div class="stack" style="gap: 0.4rem;">
      <div class="section-head">
        <h2>${esc(dict.miss.score)}</h2>
        <span class="muted">${esc(dict.miss.optional)}</span>
      </div>
      <p class="muted">${esc(dict.miss.scoreHelp)}</p>
      ${scoreGrid(view.form.score, 'form-score', dict)}
    </div>

    <div class="stack" style="gap: 0.4rem;">
      <div class="section-head">
        <h2>${esc(dict.miss.seeking)}</h2>
        <span class="muted">${esc(dict.miss.optional)}</span>
      </div>
      <p class="muted">${esc(dict.miss.seekingHelp)}</p>
      <div class="chips" role="group" aria-label="${esc(dict.miss.seeking)}">
        ${SEEKINGS.map((seeking) => {
          const on = view.fields.seeking === seeking
          return `<button type="button" class="chip${on ? ' is-on' : ''}" data-action="miss-seeking" data-value="${seeking}" aria-pressed="${on}">${esc(dict.seekings[seeking])}</button>`
        }).join('')}
      </div>
    </div>

    <label class="field">
      <span>${esc(dict.miss.note)}</span>
      <textarea id="miss-note" name="miss-note" maxlength="180" rows="3" placeholder="${esc(dict.miss.notePlaceholder)}">${esc(view.fields['miss-note'] ?? '')}</textarea>
      <span class="field-meta">${esc(dict.miss.noteLimit)}</span>
    </label>

    <button type="button" class="btn primary block" data-action="miss-save">${esc(dict.miss.save)}</button>
    <p class="note">${esc(dict.miss.calmNote)}</p>
  </section>`
}

function formatEventTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const h = String(d.getHours()).padStart(2, '0')
  const m = String(d.getMinutes()).padStart(2, '0')
  return `${h}:${m}`
}

function formatChoiceText(event: PauseEvent, dict: ViewModel['dict'], defaultPostpone: number): string {
  const isRu = dict.save === 'Сохранить'
  const postponeMins = event.postponeMinutes ?? defaultPostpone
  if (event.choice === 'open') {
    if (event.overLimit) return dict.pause.openPast
    return isRu ? 'Открыто' : 'Opened'
  }
  if (event.choice === 'postpone') {
    return isRu ? `Отложено (${postponeMins} мин)` : `Postponed (${postponeMins} min)`
  }
  if (event.choice === 'close') {
    return isRu ? 'Закрыто' : 'Closed'
  }
  if (event.choice === 'post') {
    return isRu ? 'Опубликовано' : 'Posted'
  }
  if (event.choice === 'draft') {
    return isRu ? 'Оставлен черновик' : 'Draft kept'
  }
  if (event.choice === 'dont-post') {
    return isRu ? 'Не опубликовано' : 'Not posted'
  }
  return event.choice
}

function formatDayHeader(date: string, today: string, yesterday: string, dict: ViewModel['dict']): string {
  if (date === today) return dict.journal.today
  if (date === yesterday) return dict.journal.yesterday
  return date
}

export function pauseHistory(view: ViewModel): string {
  const { db, dict, now } = view
  const today = localDate(new Date(now))
  const yesterday = addDays(today, -1)

  // 1. Collect unique triggers in order (db.triggers first, then any extra in events)
  const triggerMap = new Map<string, string>()
  for (const t of db.triggers) {
    triggerMap.set(t.id, triggerName(db, t.id, dict))
  }
  for (const e of db.events) {
    if (!triggerMap.has(e.triggerId)) {
      triggerMap.set(e.triggerId, triggerName(db, e.triggerId, dict))
    }
  }

  const activeFilter = view.fields['journal-trigger'] ?? view.fields['journal-filter'] ?? 'all'
  const isAll = activeFilter === 'all' || !activeFilter

  const chipsHtml = `
    <div class="field">
      <div class="chips" role="group" aria-label="${esc(dict.triggerScreen.title)}">
        <button type="button" class="chip${isAll ? ' is-on' : ''}" data-action="journal-filter" data-value="all" aria-pressed="${isAll}">${esc(dict.journal.filterAll)}</button>
        ${Array.from(triggerMap.entries())
          .map(([id, label]) => {
            const on = activeFilter === id
            return `<button type="button" class="chip${on ? ' is-on' : ''}" data-action="journal-filter" data-value="${esc(id)}" aria-pressed="${on}">${esc(label)}</button>`
          })
          .join('')}
      </div>
    </div>`

  // 2. Empty state when no events exist at all
  if (db.events.length === 0) {
    return `${chipsHtml}
      <article class="card empty-card" data-card="journalEmpty">
        <p>${esc(dict.home.noPauses)}</p>
        <p class="muted">${esc(dict.insight.empty)}</p>
      </article>`
  }

  // 3. Filter events
  const filtered = isAll ? db.events : db.events.filter((e) => e.triggerId === activeFilter)

  // Empty state when filtered out
  if (filtered.length === 0) {
    return `${chipsHtml}
      <article class="card empty-card" data-card="journalFilteredEmpty">
        <p class="muted">${esc(dict.journal.emptyFiltered)}</p>
      </article>`
  }

  // 4. Sort events descending (newest at first)
  const sorted = [...filtered].sort((a, b) => b.at.localeCompare(a.at))

  // 5. Group by date
  const groups: { date: string; events: PauseEvent[] }[] = []
  let currentGroup: { date: string; events: PauseEvent[] } | null = null
  for (const event of sorted) {
    if (!currentGroup || currentGroup.date !== event.date) {
      currentGroup = { date: event.date, events: [] }
      groups.push(currentGroup)
    }
    currentGroup.events.push(event)
  }

  // 6. Render groups
  const groupsHtml = groups
    .map((group) => {
      const dayHeader = formatDayHeader(group.date, today, yesterday, dict)
      const listItems = group.events
        .map((event) => {
          const name = triggerName(db, event.triggerId, dict)
          const time = formatEventTime(event.at)
          const choice = formatChoiceText(event, dict, db.settings.postponeMinutes)
          const impulse = impulseName(event.seeking, dict)
          const scoreDelta = event.awarenessAfter !== undefined ? ` → ${event.awarenessAfter}` : ''
          return `<li>
            <div>
              <strong>${esc(name)}</strong>${time ? `<span class="muted"> · ${esc(time)}</span>` : ''}
              <p class="muted" style="margin-top: 0.2rem; font-size: 0.95rem;">
                <span>${esc(dict.a11y.score(event.awarenessBefore))}${scoreDelta}</span>
                · <span>${esc(impulse)}</span>
                · <span>${esc(choice)}</span>
              </p>
            </div>
            <span class="badge" style="font-weight: 600; font-size: 1.1rem; min-width: 2rem; text-align: right;">${event.awarenessBefore}</span>
          </li>`
        })
        .join('')

      return `<div class="journal-day stack" style="gap: 0.4rem;">
        <div class="section-head" style="display: flex; justify-content: space-between; align-items: baseline;">
          <h2>${esc(dayHeader)}</h2>
          <span class="muted" style="font-size: 0.9rem;">${group.events.length}</span>
        </div>
        <ul class="stat-list">
          ${listItems}
        </ul>
      </div>`
    })
    .join('')

  return `${chipsHtml}
    <div class="stack" style="gap: 1.25rem;">
      ${groupsHtml}
    </div>`
}

export function journalScreen(view: ViewModel): string {
  const { dict } = view
  const isRu = dict.save === 'Сохранить'
  return `<section class="stack">
    <a class="text-btn" href="#/today">${esc(dict.back)}</a>
    <p class="kicker">${esc(dict.appName)}</p>
    <h1 id="step-title">${esc(isRu ? 'История пауз' : 'Pause history')}</h1>
    ${pauseHistory(view)}
  </section>`
}

export const historyScreen = journalScreen

