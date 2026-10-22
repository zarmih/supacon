import type { DayPart } from '../domain/diagnosis'
import type { Choice } from '../domain/types'

/** Copy for the day 7 report, the evening pause list, and today against yesterday. */
export interface ReportCopy {
  link: string
  title: string
  kicker: string
  forming: (day: number) => string
  none: string
  range: (from: string, to: string) => string
  caught: (pauses: number, misses: number) => string
  caughtShare: (pct: number) => string
  choices: (opened: number, postponed: number, closed: number) => string
  avg: (avg: string) => string
  triggersTitle: string
  triggerLine: (pauses: number, misses: number, opened: number) => string
  triggersNone: string
  timeTitle: string
  highest: (part: string, avg: string) => string
  lowest: (part: string, avg: string) => string
  timeNone: string
  parts: Record<DayPart, string>
  likesTitle: string
  likes: Record<'yes' | 'no' | 'unsure', string>
  likesNone: string
  brokeTitle: string
  brokeNone: string
  minutes: (sessions: number, minutes: number) => string
  overLimit: (sessions: number, minutes: number) => string
  posts: (paused: number, back: number) => string
  calm: string
  eveningListTitle: string
  eveningListEmpty: string
  choice: Record<Choice, string>
  overLimitTag: string
  eveningLowest: (time: string, trigger: string, score: number) => string
  compare: (today: string, yesterday: string) => string
  compareSame: (today: string) => string
  compareNoYesterday: (today: string) => string
  seekingLow: (label: string) => string
}

export const reportEn: ReportCopy = {
  link: 'Seven-day report',
  title: 'What the seven days recorded',
  kicker: 'Day 7 · Diagnosis',
  forming: (day) => `Day ${day} of 7. The report keeps filling in until the evening of day 7.`,
  none: 'The seven days have not started. The report appears once day 1 begins.',
  range: (from, to) => `${from} — ${to}`,
  caught: (pauses, misses) => `Pauses that happened: ${pauses}. Misses: ${misses}.`,
  caughtShare: (pct) => `${pct}% of the pulls met a pause.`,
  choices: (opened, postponed, closed) => `Opened ${opened}, postponed ${postponed}, closed ${closed}.`,
  avg: (avg) => `Average awareness over the seven days: ${avg}.`,
  triggersTitle: 'The strongest triggers',
  triggerLine: (pauses, misses, opened) => `${pauses} pauses · ${misses} misses · opened ${opened}`,
  triggersNone: 'No trigger has come up twice yet.',
  timeTitle: 'When awareness was highest and lowest',
  highest: (part, avg) => `Highest: ${part}, average ${avg}.`,
  lowest: (part, avg) => `Lowest: ${part}, average ${avg}.`,
  timeNone: 'Two parts of the day need at least three pauses each before this can be said.',
  parts: {
    morning: 'morning (05–12)',
    afternoon: 'afternoon (12–18)',
    evening: 'evening (18–23)',
    night: 'night (23–05)',
  },
  likesTitle: 'Did the feeling from likes change?',
  likes: { yes: 'Yes, it changed.', no: 'No, it did not change.', unsure: 'Not sure yet.' },
  likesNone: 'Answered in the evening review of day 7.',
  brokeTitle: 'Where the protocol broke most often',
  brokeNone: 'Written in the evening review of day 7.',
  minutes: (sessions, minutes) => `Sessions: ${sessions}, ${minutes} min inside them in total.`,
  overLimit: (sessions, minutes) =>
    sessions === 0 && minutes === 0
      ? 'No session went past the cap.'
      : `Sessions past the cap: ${sessions}. Extra minutes: ${minutes}.`,
  posts: (paused, back) => `Pauses before posting: ${paused}. Stepped back: ${back}.`,
  calm: 'This is a record, not a grade. Misses are part of it.',
  eveningListTitle: 'Every pause today',
  eveningListEmpty: 'No pauses were logged today.',
  choice: { open: 'Opened', postpone: 'Postponed', close: 'Closed', post: 'Posted', draft: 'Kept as a draft', 'dont-post': 'Not posted' },
  overLimitTag: 'past the cap',
  eveningLowest: (time, trigger, score) => `Lowest in the record: ${time} · ${trigger} · ${score}.`,
  compare: (today, yesterday) => `Average today ${today} · yesterday ${yesterday}`,
  compareSame: (today) => `Average today ${today} · the same as yesterday`,
  compareNoYesterday: (today) => `Average today ${today} · no pauses yesterday`,
  seekingLow: (label) => `When the score was low today, you were seeking: ${label.toLowerCase()}.`,
}

export const reportRu: ReportCopy = {
  link: 'Отчёт за семь дней',
  title: 'Что записали семь дней',
  kicker: 'День 7 · Диагностика',
  forming: (day) => `День ${day} из 7. Отчёт дополняется до вечера седьмого дня.`,
  none: 'Семь дней ещё не начались. Отчёт появится с первого дня.',
  range: (from, to) => `${from} — ${to}`,
  caught: (pauses, misses) => `Паузы, которые случились: ${pauses}. Пропуски: ${misses}.`,
  caughtShare: (pct) => `${pct}% импульсов встретили паузу.`,
  choices: (opened, postponed, closed) => `Открыто ${opened}, отложено ${postponed}, закрыто ${closed}.`,
  avg: (avg) => `Средняя осознанность за семь дней: ${avg}.`,
  triggersTitle: 'Самые сильные триггеры',
  triggerLine: (pauses, misses, opened) => `пауз ${pauses} · пропусков ${misses} · открыто ${opened}`,
  triggersNone: 'Ни один триггер пока не встретился дважды.',
  timeTitle: 'Когда осознанность была выше и ниже всего',
  highest: (part, avg) => `Выше всего: ${part}, в среднем ${avg}.`,
  lowest: (part, avg) => `Ниже всего: ${part}, в среднем ${avg}.`,
  timeNone: 'Нужно хотя бы по три паузы в двух частях дня, чтобы это сказать.',
  parts: {
    morning: 'утро (05–12)',
    afternoon: 'день (12–18)',
    evening: 'вечер (18–23)',
    night: 'ночь (23–05)',
  },
  likesTitle: 'Изменилось ли ощущение от лайков?',
  likes: { yes: 'Да, изменилось.', no: 'Нет, не изменилось.', unsure: 'Пока непонятно.' },
  likesNone: 'Ответ — в вечернем обзоре седьмого дня.',
  brokeTitle: 'Где протокол ломался чаще всего',
  brokeNone: 'Пишется в вечернем обзоре седьмого дня.',
  minutes: (sessions, minutes) => `Сессий: ${sessions}, внутри них всего ${minutes} мин.`,
  overLimit: (sessions, minutes) =>
    sessions === 0 && minutes === 0
      ? 'Ни одна сессия не вышла за лимит.'
      : `Сессий сверх лимита: ${sessions}. Дополнительных минут: ${minutes}.`,
  posts: (paused, back) => `Пауз перед публикацией: ${paused}. Отступлений: ${back}.`,
  calm: 'Это запись, а не оценка. Пропуски — её часть.',
  eveningListTitle: 'Все паузы сегодня',
  eveningListEmpty: 'Сегодня пауз не записано.',
  choice: { open: 'Открыто', postpone: 'Отложено', close: 'Закрыто', post: 'Опубликовано', draft: 'Оставлено черновиком', 'dont-post': 'Не опубликовано' },
  overLimitTag: 'сверх лимита',
  eveningLowest: (time, trigger, score) => `Ниже всего в записи: ${time} · ${trigger} · ${score}.`,
  compare: (today, yesterday) => `Среднее сегодня ${today} · вчера ${yesterday}`,
  compareSame: (today) => `Среднее сегодня ${today} · так же, как вчера`,
  compareNoYesterday: (today) => `Среднее сегодня ${today} · вчера пауз не было`,
  seekingLow: (label) => `При низком балле сегодня чаще всего звучало: ${label.toLowerCase()}.`,
}
