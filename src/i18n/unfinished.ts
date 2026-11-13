const unfinishedStepsEn = {
  arrive: 'arriving',
  score: 'the score',
  seeking: 'what you seek',
  choose: 'the choice',
  after: 'the second score',
}

const unfinishedStepsRu: typeof unfinishedStepsEn = {
  arrive: 'остановка',
  score: 'оценка',
  seeking: 'что ищешь',
  choose: 'выбор',
  after: 'вторая оценка',
}

export const unfinishedEn = {
  title: 'A pause is unfinished',
  body: (trigger: string, time: string, step: string) => `${trigger}, started ${time}. Stopped at ${step}. Nothing is recorded until you choose.`,
  resume: 'Continue the pause',
  discard: 'Discard it',
  discarded: 'The unfinished pause was discarded.',
  conflictTitle: (trigger: string) => `A pause for ${trigger} is still open`,
  conflictBody: 'One pause at a time. Finish the open one, or discard it and start this one.',
  conflictResume: (trigger: string) => `Continue ${trigger}`,
  conflictReplace: (trigger: string) => `Discard it and pause for ${trigger}`,
  savedElsewhere: 'This pause was already saved in another tab. It is in the record once.',
  notStored: 'This device is refusing to store the unfinished pause. It stays while this tab is open.',
  steps: unfinishedStepsEn,
}

export const unfinishedRu: typeof unfinishedEn = {
  title: 'Пауза не закончена',
  body: (trigger: string, time: string, step: string) => `${trigger}, начата в ${time}. Остановилась на шаге «${step}». Пока нет выбора, ничего не записано.`,
  resume: 'Продолжить паузу',
  discard: 'Отбросить',
  discarded: 'Незаконченная пауза отброшена.',
  conflictTitle: (trigger: string) => `Пауза для «${trigger}» ещё открыта`,
  conflictBody: 'Одна пауза за раз. Закончи открытую или отбрось её и начни эту.',
  conflictResume: (trigger: string) => `Продолжить «${trigger}»`,
  conflictReplace: (trigger: string) => `Отбросить и начать «${trigger}»`,
  savedElsewhere: 'Эта пауза уже сохранена в другой вкладке. В записи она одна.',
  notStored: 'Устройство не даёт сохранить незаконченную паузу. Она останется, пока открыта эта вкладка.',
  steps: unfinishedStepsRu,
}
