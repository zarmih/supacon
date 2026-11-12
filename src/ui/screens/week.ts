import { EXPERIMENTS, dayNumber } from '../../domain/protocol'
import { addDays, localDate, parseDate } from '../../domain/time'
import {
  activeExperiment,
  checkOn,
  experimentDay,
  experimentOver,
  returnAfterBreak,
  weekReview,
  type WeekReview,
} from '../../domain/week'
import { EXPERIMENT_RESULTS, type WeeklyExperiment } from '../../domain/types'
import { esc, formatAvg } from '../html'
import type { ViewModel } from '../model'

export function shortDate(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale === 'ru' ? 'ru-RU' : 'en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(parseDate(iso))
}

function range(experiment: { startDate: string; endDate: string }, view: ViewModel): string {
  return view.dict.week.dates(shortDate(experiment.startDate, view.dict.locale), shortDate(experiment.endDate, view.dict.locale))
}

function resultButtons(view: ViewModel, experiment: WeeklyExperiment, today: string): string {
  const current = checkOn(experiment, today)
  return `<div class="chips" role="group" aria-label="${esc(view.dict.week.todayQuestion)}">
    ${EXPERIMENT_RESULTS.map((result) => {
      const on = current?.result === result
      return `<button type="button" class="chip${on ? ' is-on' : ''}" data-action="exp-mark" data-value="${result}" aria-pressed="${on}">${esc(view.dict.week.results[result])}</button>`
    }).join('')}
  </div>`
}

export function experimentScreen(view: ViewModel): string {
  const { db, dict, now } = view
  const copy = dict.week
  const today = localDate(new Date(now))
  const active = activeExperiment(db)
  const past = db.weekly.filter((item) => item.status !== 'active').slice().reverse()
  const history = past.length
    ? `<section aria-labelledby="exp-history"><h2 id="exp-history">${esc(copy.historyTitle)}</h2>
        <ul class="stat-list">${past
          .map((item) => `<li><span>${esc(copy.historyLine(item.intention, range(item, view), item.checks.length))}</span><span class="muted">${esc(item.status === 'finished' ? copy.statusFinished : copy.statusStopped)}</span></li>`)
          .join('')}</ul></section>`
    : ''

  if (!active) {
    const start = view.fields['exp-start'] === 'tomorrow' ? addDays(today, 1) : today
    return `<section class="stack experiment">
      <a class="text-btn" href="#/today">${esc(dict.back)}</a>
      <h1 id="step-title">${esc(copy.title)}</h1>
      ${view.flash ? `<p class="flash" role="status">${esc(view.flash)}</p>` : ''}
      <p class="lede">${esc(copy.lede)}</p>
      <section aria-labelledby="exp-suggest">
        <h2 id="exp-suggest">${esc(copy.suggestionsTitle)}</h2>
        <div class="chips">
          ${EXPERIMENTS.map((item) => {
            const on = view.fields['exp-source'] === item.id
            return `<button type="button" class="chip${on ? ' is-on' : ''}" data-action="exp-suggest" data-value="${item.id}" aria-pressed="${on}">${esc(dict.experiments[item.id].title)}</button>`
          }).join('')}
        </div>
      </section>
      <label class="field"><span>${esc(copy.intentionLabel)}</span>
        <textarea id="exp-intention" maxlength="120" rows="3" placeholder="${esc(copy.intentionPlaceholder)}">${esc(view.fields['exp-intention'] ?? '')}</textarea>
      </label>
      <div class="chips" role="group" aria-label="${esc(copy.startLabel)}">
        <button type="button" class="chip${start === today ? ' is-on' : ''}" data-action="exp-start" data-value="today" aria-pressed="${start === today}">${esc(copy.startToday)}</button>
        <button type="button" class="chip${start !== today ? ' is-on' : ''}" data-action="exp-start" data-value="tomorrow" aria-pressed="${start !== today}">${esc(copy.startTomorrow)}</button>
      </div>
      <p class="muted" data-exp-dates>${esc(copy.dates(shortDate(start, dict.locale), shortDate(addDays(start, 6), dict.locale)))}</p>
      <button type="button" class="btn primary block" data-action="exp-begin">${esc(copy.start)}</button>
      ${past.length ? `<a class="text-link" href="#/week">${esc(copy.review)} →</a>` : ''}
      ${history}
    </section>`
  }

  const day = experimentDay(active, today)
  const over = experimentOver(active, today)
  const current = checkOn(active, today)
  const editing = view.fields['exp-editing'] === '1'
  return `<section class="stack experiment">
    <a class="text-btn" href="#/today">${esc(dict.back)}</a>
    <p class="kicker">${esc(copy.title)} · ${esc(range(active, view))}</p>
    <h1 id="step-title">${esc(active.intention)}</h1>
    <p class="muted">${esc(day === null ? copy.notYet : over ? copy.over : copy.dayOf(day))}</p>
    ${
      editing
        ? `<label class="field"><span>${esc(copy.intentionLabel)}</span>
            <textarea id="exp-edit" maxlength="120" rows="3">${esc(view.fields['exp-edit'] ?? active.intention)}</textarea></label>
           <button type="button" class="btn" data-action="exp-save-edit">${esc(copy.saveEdit)}</button>`
        : `<button type="button" class="text-btn" data-action="exp-edit">${esc(copy.edit)}</button>`
    }
    ${
      day !== null && !over
        ? `<section class="card" aria-labelledby="exp-today">
            <h2 id="exp-today">${esc(copy.todayQuestion)}</h2>
            <label class="field"><span>${esc(copy.noteLabel)}</span>
              <input id="exp-note" maxlength="140" placeholder="${esc(copy.notePlaceholder)}" value="${esc(view.fields['exp-note'] ?? current?.note ?? '')}" /></label>
            ${resultButtons(view, active, today)}
            ${current ? `<p class="muted" role="status">${esc(copy.marked(copy.results[current.result]))}</p>` : ''}
          </section>`
        : ''
    }
    <section aria-labelledby="exp-marks">
      <h2 id="exp-marks">${esc(copy.marksTitle)}</h2>
      ${
        active.checks.length === 0
          ? `<p class="muted">${esc(copy.noMarks)}</p>`
          : `<ul class="stat-list">${active.checks
              .map((check) => `<li><span>${esc(shortDate(check.date, dict.locale))}</span><span>${esc(copy.results[check.result])}${check.note ? ` · ${esc(check.note)}` : ''}</span></li>`)
              .join('')}</ul>`
      }
    </section>
    <a class="btn block" href="#/week">${esc(copy.review)}</a>
    <button type="button" class="btn ghost block" data-action="exp-end">${esc(copy.end)}</button>
    <p class="muted">${esc(copy.endHint)}</p>
    ${history}
  </section>`
}

function observations(review: WeekReview, view: ViewModel): string[] {
  const copy = view.dict.week
  const lines: string[] = [copy.sample(review.browse.n)]
  if (review.browse.n > 0) {
    lines.push(copy.choices(review.opened, review.postponed, review.closed))
    if (review.browse.median !== null) lines.push(copy.median(formatAvg(review.browse.median)))
  }
  if (review.secondScores.n > 0 && review.secondScores.meanMove !== null) lines.push(copy.secondScores(review.secondScores.n, review.secondScores.meanMove))
  if (review.sessions.n > 0) lines.push(copy.sessions(review.sessions.n, review.sessions.yes, review.sessions.partly, review.sessions.no))
  if (review.experiment) lines.push(copy.experimentLine(review.experiment.did, review.experiment.partly, review.experiment.notToday, review.experiment.unmarked))
  if (review.comparable && review.previous.median !== null && review.browse.median !== null) {
    lines.push(copy.compare(formatAvg(review.previous.median), review.previous.n, formatAvg(review.browse.median), review.browse.n))
  }
  if (review.posts > 0) lines.push(copy.posts(review.posts))
  if (review.misses > 0) lines.push(copy.misses(review.misses))
  if (review.elapsed > 0) lines.push(copy.days(review.daysWithRecord, review.elapsed))
  return lines
}

export function weekReviewScreen(view: ViewModel): string {
  const { db, dict, now } = view
  const copy = dict.week
  const today = localDate(new Date(now))
  const review = weekReview(db, today)
  const dates = copy.dates(shortDate(review.start, dict.locale), shortDate(review.end, dict.locale))
  const active = activeExperiment(db)
  const empty = review.browse.n === 0 && review.daysWithRecord === 0
  const limitValue = (id: WeekReview['limits'][number]) =>
    id === 'small-sample' ? review.browse.n : id === 'no-compare' ? review.previous.n : id === 'partial-week' ? review.elapsed : id === 'gaps' ? review.elapsed - review.daysWithRecord : 0
  return `<section class="stack week-review">
    <a class="text-btn" href="${active ? '#/experiment' : '#/today'}">${esc(dict.back)}</a>
    <h1 id="step-title">${esc(copy.reviewTitle)}</h1>
    <p class="muted">${esc(review.elapsed >= 7 ? copy.rangeDone(dates) : copy.range(dates, review.elapsed))}</p>
    ${review.experiment ? `<p class="lede">${esc(review.experiment.intention)}</p>` : ''}
    <section class="card" aria-labelledby="week-obs" data-section="observations">
      <h2 id="week-obs">1. ${esc(copy.observationsTitle)}</h2>
      ${empty ? `<p>${esc(copy.nothing)}</p>` : `<ul class="rules">${observations(review, view).map((line) => `<li>${esc(line)}</li>`).join('')}</ul>`}
    </section>
    <section class="card" aria-labelledby="week-limits" data-section="limits">
      <h2 id="week-limits">2. ${esc(copy.limitsTitle)}</h2>
      <ul class="rules">${review.limits.map((id) => `<li data-limit="${id}">${esc(copy.limits[id](limitValue(id)))}</li>`).join('')}</ul>
    </section>
    <section class="card" aria-labelledby="week-next" data-section="next">
      <h2 id="week-next">3. ${esc(copy.nextTitle)}</h2>
      <p data-step="${review.next}">${esc(copy.steps[review.next])}</p>
    </section>
    ${
      active
        ? experimentOver(active, today)
          ? `<button type="button" class="btn primary block" data-action="exp-end-next">${esc(copy.startNext)}</button>`
          : `<a class="btn block" href="#/experiment">${esc(copy.openExperiment)}</a>`
        : `<a class="btn primary block" href="#/experiment">${esc(db.weekly.length ? copy.startNext : copy.startFirst)}</a>`
    }
  </section>`
}

/** Today, after the seven days: the week's intention and today's mark, or an invitation. */
export function experimentTodayCard(view: ViewModel): string {
  const { db, dict, now } = view
  const copy = dict.week
  const today = localDate(new Date(now))
  const day = dayNumber(db.startedOn, today)
  if (db.practiceMode === null && (day === null || day < 8)) return ''
  const active = activeExperiment(db)
  if (!active) {
    if (db.practiceMode !== 'deepening') return ''
    return `<a class="card link-card" href="#/experiment" data-card="experimentCard"><span class="kicker">${esc(copy.title)}</span><span>${esc(copy.startFirst)}</span></a>`
  }
  const current = checkOn(active, today)
  const expDay = experimentDay(active, today)
  const over = experimentOver(active, today)
  return `<section class="card experiment-card" data-card="experimentCard">
    <p class="kicker">${esc(copy.title)} · ${esc(expDay === null ? copy.notYet : over ? range(active, view) : copy.dayOf(expDay))}</p>
    <h2>${esc(active.intention)}</h2>
    ${over ? `<p class="muted">${esc(copy.over)}</p>` : expDay !== null ? `<p class="muted">${esc(current ? copy.todayMarked(copy.results[current.result]) : copy.todayUnmarked)}</p>` : ''}
    <a class="text-link" href="${over ? '#/week' : '#/experiment'}">${esc(over ? copy.review : copy.openExperiment)} →</a>
  </section>`
}

/** Back after days without a record: no shame, the history is intact, two ways to go on. */
export function breakCard(view: ViewModel): string {
  const { db, dict, now } = view
  const copy = dict.week
  const today = localDate(new Date(now))
  const gap = returnAfterBreak(db, today)
  if (!gap) return ''
  const active = activeExperiment(db)
  // Already back on track with a running week: the greeting has done its job.
  if (active && !experimentOver(active, today)) return ''
  const day = dayNumber(db.startedOn, today)
  const inProtocol = db.practiceMode === null && day !== null && day <= 7
  return `<section class="card break-card" data-card="break" aria-labelledby="break-title">
    <h2 id="break-title">${esc(copy.breakTitle)}</h2>
    <p>${esc(copy.breakBody(gap.days, shortDate(gap.last, dict.locale)))}</p>
    ${active && experimentOver(active, today) ? `<p class="muted">${esc(copy.breakExperiment(active.intention))}</p><a class="text-link" href="#/week">${esc(copy.review)} →</a>` : ''}
    ${!active ? `<a class="text-link" href="#/experiment">${esc(copy.breakWeek)} →</a>` : ''}
    ${inProtocol ? `<button type="button" class="text-btn" data-action="confirm" data-value="restart">${esc(copy.breakRestart)}</button>` : ''}
  </section>`
}
