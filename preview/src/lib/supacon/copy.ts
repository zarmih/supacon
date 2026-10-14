import type { Locale } from "./types";

export type Copy = {
  app: string;
  tagline: string;
  pulls: string;
  addName: string;
  add: string;
  begin: string;
  skip: string;
  needOne: string;
  today: string;
  pause: string;
  record: string;
  settings: string;
  notice: string;
  day: string;
  phases: Record<string, string>;
  pausesToday: string;
  noPauses: string;
  sessions: string;
  noCap: string;
  awareness: string;
  yesterday: string;
  none: string;
  morning: string;
  focus: string;
  evening: string;
  plan: string;
  beforePost: string;
  miss: string;
  postponed: string;
  min: string;
  running: string;
  chooseMode: string;
  maintenance: string;
  deepening: string;
  openMode: string;
  maintenanceLine: string;
  openLine: string;
  experiments: string[];
  lowSeeking: string;
  here: string;
  hereLine: string;
  present: string;
  notAuto: string;
  bands: [string, string, string, string];
  seekingQ: string;
  postQ: string;
  nameIt: string;
  stay: string;
  canChoose: string;
  open: string;
  postpone: string;
  close: string;
  post: string;
  draft: string;
  dont: string;
  enough: string;
  enoughHint: string;
  moved: string;
  skipScore: string;
  over: string;
  session: string;
  windowOver: string;
  endSession: string;
  delivered: string;
  yes: string;
  partly: string;
  no: string;
  enoughWas: string;
  logged: string;
  extend: string;
  breaths: string;
  desire: string;
  save: string;
  saved: string;
  lowest: string;
  note: string;
  misses: string;
  conversation: string;
  diagnosis: string;
  focusLine: string;
  start: string;
  end: string;
  loudSuggest: string;
  letterQuiet: string;
  example: string;
  eraseExample: string;
  week: string;
  weekLine: string;
  language: string;
  english: string;
  russian: string;
  theme: string;
  ink: string;
  paper: string;
  system: string;
  breath: string;
  seconds: string;
  triggers: string;
  export: string;
  import: string;
  erase: string;
  eraseConfirm: string;
  cancel: string;
  badFile: string;
  cannot: string;
  restart: string;
  windows: string;
  windowsLine: string;
  night: string;
  nightOff: string;
  replace: string;
  planLine: string;
  nightNow: string;
  windowNow: string;
  back: string;
  done: string;
  missLine: string;
  missScore: string;
  missSeek: string;
  presets: Record<string, string>;
  seeking: Record<string, string>;
  postSeeking: Record<string, string>;
  choices: Record<string, string>;
  hints: Record<string, string>;
  functions: Record<string, string>;
  replacements: Record<string, string>;
  insights: Record<string, string>;
};

const en: Copy = {
  app: "Supacon",
  tagline: "A thin layer between the impulse and the next tap. Opening stays allowed.",
  pulls: "What pulls you",
  addName: "A name",
  add: "Add",
  begin: "Begin day 1",
  skip: "Practice without a cap",
  needOne: "Keep at least one. Something else stays available.",
  today: "Today",
  pause: "Pause",
  record: "Record",
  settings: "Settings",
  notice: "Notice the impulse. Opening is allowed.",
  day: "Day",
  phases: {
    calibration: "Calibration",
    boundary: "Boundary",
    contrast: "Contrast",
    diagnosis: "Diagnosis",
    choose: "After the seven days",
    practice: "Practice",
  },
  pausesToday: "Pauses today",
  noPauses: "No pauses yet today.",
  sessions: "Sessions",
  noCap: "No cap today",
  awareness: "Awareness",
  yesterday: "yesterday",
  none: "—",
  morning: "Morning check-in",
  focus: "Focus block",
  evening: "Evening review",
  plan: "Windows and replacements",
  beforePost: "Before posting",
  miss: "Opened without a pause",
  postponed: "is postponed",
  min: "min",
  running: "Session running",
  chooseMode: "The seven days are done. How do you continue?",
  maintenance: "Keep the cap",
  deepening: "One experiment a week",
  openMode: "Drop the cap",
  maintenanceLine: "The cap stays. Look at the record, not a streak.",
  openLine: "The cap is off until you put a number back.",
  experiments: [
    "This week: name the impulse out loud once, before the tap.",
    "This week: score the body, not only the thought. Tight, hot, restless, or quiet.",
    "This week: stay with one urge for the breath and do not open it.",
    "This week: one real voice, then compare the feeling to a like.",
    "This week: look a second time at one pause. Did the number move?",
  ],
  lowSeeking: "When awareness was low, the usual name was",
  here: "I'm here",
  hereLine: "Stop before you score. The first three browse pauses include this beat.",
  present: "How present am I right now?",
  notAuto: "Not on autopilot.",
  bands: ["1–3 autopilot", "4–6 partial", "7–8 clear", "9–10 spacious"],
  seekingQ: "What am I seeking?",
  postQ: "Why am I posting this?",
  nameIt: "A short name",
  stay: "Stay with it",
  canChoose: "You can choose.",
  open: "Open",
  postpone: "Postpone 30 min",
  close: "Close",
  post: "Post",
  draft: "Keep the draft",
  dont: "Don't post",
  enough: "Enough looks like",
  enoughHint: "Optional. An open without this line stays unfinished.",
  moved: "Did the number move?",
  skipScore: "Skip",
  over: "Past the cap. It will be labeled, not hidden.",
  session: "Session running",
  windowOver: "The window is over. You can close.",
  endSession: "End session",
  delivered: "Did it give you what you were seeking?",
  yes: "Yes",
  partly: "Partly",
  no: "No",
  enoughWas: "Enough was",
  logged: "Session logged.",
  extend: "Add 5 min",
  breaths: "After three breaths.",
  desire: "The first desire",
  save: "Save",
  saved: "Saved.",
  lowest: "When was awareness lowest?",
  note: "A note",
  misses: "Openings you did not log",
  conversation: "Did a real conversation happen?",
  diagnosis: "Where did the protocol break most often?",
  focusLine: "45 minutes. The phone is in another room.",
  start: "Start",
  end: "End",
  loudSuggest: "The loudest hour has been {hour}:00. The focus block can sit there.",
  letterQuiet: "The letter stays quiet until the counts clear a bar. Nothing here is invented.",
  example: "Load an example week",
  eraseExample: "Erase the example",
  week: "Week against week",
  weekLine: "Median awareness {a} → {b}. Opens {c} → {d}.",
  language: "Language",
  english: "English",
  russian: "Russian",
  theme: "Theme",
  ink: "Ink",
  paper: "Paper",
  system: "System",
  breath: "Breath",
  seconds: "s",
  triggers: "Triggers",
  export: "Export",
  import: "Import",
  erase: "Erase the record",
  eraseConfirm: "Erase it. This device only.",
  cancel: "Cancel",
  badFile: "This file is not a Supacon record this version understands.",
  cannot:
    "This page cannot stand in front of another app. Open Supacon first, or place the icon beside the thing that pulls you.",
  restart: "Start the seven days over. History stays.",
  windows: "Up to three times",
  windowsLine: "Written while you are calm. The pause will mention a window. It will not lock the door.",
  night: "Night hour",
  nightOff: "None",
  replace: "A replacement, in your words",
  planLine: "The pause mentions these. It never stops you.",
  nightNow: "Night hour. The phone can stay out of reach.",
  windowNow: "One of the windows you set is open.",
  back: "Back",
  done: "Done",
  missLine: "A miss is data. No penalty.",
  missScore: "Recalled score, if you have one",
  missSeek: "What were you seeking?",
  presets: {
    instagram: "Instagram",
    youtube: "YouTube",
    telegram: "Telegram",
    browser: "Browser",
    other: "Something else",
  },
  seeking: {
    boredom: "Boredom",
    validation: "Validation",
    information: "Information",
    habit: "Habit",
    relief: "Relief",
    connection: "Connection",
    stimulation: "Stimulation",
    status: "Status",
    loss: "Not losing it",
    other: "Something else",
  },
  postSeeking: {
    seen: "To be seen",
    truth: "To say it",
    habit: "Habit",
    anxiety: "Anxiety",
    unsure: "Unsure",
  },
  choices: {
    open: "Open",
    postpone: "Postpone",
    close: "Close",
    post: "Post",
    draft: "Draft",
    dont: "Didn't post",
  },
  hints: {
    over: "The session cap for today is already used. An opening still stays in the record.",
    high: "At a clear score, opening still happens almost every time. The pause shows that. It does not forbid it.",
    spacious: "There is room between the impulse and the tap.",
    low: "At a low score, opening happens almost every time. That is an observation, not a verdict.",
    emptyPostpone: "The last postpones of this seeking did not become a session.",
    loud: "This hour is usually the loudest.",
  },
  functions: {
    approval: "The leading pull is approval.",
    status: "The leading pull is status.",
    belonging: "The leading pull is belonging.",
    novelty: "The leading pull is novelty.",
    relief: "The leading pull is relief.",
    loss: "The leading pull is not wanting to miss the next one.",
  },
  replacements: {
    approval: "One sentence to a person, not to the feed.",
    status: "The number does not move your standing tonight.",
    belonging: "One voice to someone who knows your name.",
    novelty: "One finite piece with an ending. Then stop.",
    relief: "Ten breaths, or water, then look again.",
    loss: "The next check is not the one that ends it.",
    other: "Name a finite next step that is not the feed.",
  },
  insights: {
    threshold:
      "Below {cut}, opening happens {below} of the time. At {cut} and above, {above}.",
    seeking: "When awareness was 4 or below, the usual name was {name}.",
    naming: "After naming it, the second score moved {delta} on average.",
    baseline: "Days 1–2 averaged {early}. Days 5–7 averaged {late}.",
    loud: "The loudest hour is {hour}:00.",
    posts: "{total} posting pauses. {back} stepped back.",
    highOpens:
      "Awareness is high, and opening still happens most of the time.",
    wanting:
      "Half or more of the finished sessions did not deliver what was sought. Wanting and liking are not the same.",
    unfinished: "Half or more of the opens had no line for what enough looks like.",
    moved: "The pull moved. The leading trigger is not the one it started as.",
  },
};

const ru: Copy = {
  app: "Supacon",
  tagline: "Тонкий слой между импульсом и следующим касанием. Открыть можно всегда.",
  pulls: "Что тянет",
  addName: "Имя",
  add: "Добавить",
  begin: "Начать день 1",
  skip: "Практиковать без лимита",
  needOne: "Оставь хотя бы одно. «Что-то ещё» остаётся доступным.",
  today: "Сегодня",
  pause: "Пауза",
  record: "Запись",
  settings: "Настройки",
  notice: "Заметь импульс. Открыть можно.",
  day: "День",
  phases: {
    calibration: "Калибровка",
    boundary: "Граница",
    contrast: "Контраст",
    diagnosis: "Диагноз",
    choose: "После семи дней",
    practice: "Практика",
  },
  pausesToday: "Паузы сегодня",
  noPauses: "Сегодня пауз ещё нет.",
  sessions: "Сессии",
  noCap: "Сегодня лимита нет",
  awareness: "Осознанность",
  yesterday: "вчера",
  none: "—",
  morning: "Утренний чек-ин",
  focus: "Фокус-блок",
  evening: "Вечерний разбор",
  plan: "Окна и замены",
  beforePost: "Перед публикацией",
  miss: "Открытие без паузы",
  postponed: "отложено",
  min: "мин",
  running: "Сессия идёт",
  chooseMode: "Семь дней пройдены. Как продолжать?",
  maintenance: "Оставить лимит",
  deepening: "Один опыт в неделю",
  openMode: "Снять лимит",
  maintenanceLine: "Лимит на месте. Смотри на запись, не на серию.",
  openLine: "Лимита нет, пока снова не поставишь число.",
  experiments: [
    "На этой неделе: один раз назвать импульс вслух, до касания.",
    "На этой неделе: оценить тело, не только мысль. Сжато, горячо, беспокойно или тихо.",
    "На этой неделе: побыть с одним желанием на вдох и не открывать.",
    "На этой неделе: один живой голос, потом сравнить чувство с лайком.",
    "На этой неделе: второй взгляд на одну паузу. Число сдвинулось?",
  ],
  lowSeeking: "Когда осознанность была низкой, обычное имя —",
  here: "Я здесь",
  hereLine: "Остановись до счёта. Первые три паузы просмотра включают этот шаг.",
  present: "Насколько я сейчас здесь?",
  notAuto: "Не на автопилоте.",
  bands: ["1–3 автопилот", "4–6 частично", "7–8 ясно", "9–10 просторно"],
  seekingQ: "Чего я ищу?",
  postQ: "Зачем я это публикую?",
  nameIt: "Короткое имя",
  stay: "Побудь с этим",
  canChoose: "Можно выбирать.",
  open: "Открыть",
  postpone: "Отложить на 30 мин",
  close: "Закрыть",
  post: "Опубликовать",
  draft: "Оставить черновик",
  dont: "Не публиковать",
  enough: "«Достаточно» выглядит так",
  enoughHint: "Необязательно. Открытие без этой строки остаётся незавершённым.",
  moved: "Число сдвинулось?",
  skipScore: "Пропустить",
  over: "Уже за лимитом. Будет подписано, не спрятано.",
  session: "Сессия идёт",
  windowOver: "Окно кончилось. Можно закрыть.",
  endSession: "Закончить сессию",
  delivered: "Это дало то, чего ты ищешь?",
  yes: "Да",
  partly: "Частично",
  no: "Нет",
  enoughWas: "Достаточно было",
  logged: "Сессия записана.",
  extend: "Ещё 5 мин",
  breaths: "После трёх вдохов.",
  desire: "Первое желание",
  save: "Сохранить",
  saved: "Сохранено.",
  lowest: "Когда осознанность была ниже всего?",
  note: "Заметка",
  misses: "Открытия без записи",
  conversation: "Был живой разговор?",
  diagnosis: "Где протокол ломался чаще всего?",
  focusLine: "45 минут. Телефон в другой комнате.",
  start: "Начать",
  end: "Закончить",
  loudSuggest: "Самый громкий час — {hour}:00. Фокус-блок может стоять там.",
  letterQuiet: "Письмо молчит, пока числа не проходят порог. Здесь ничего не выдумано.",
  example: "Показать пример недели",
  eraseExample: "Стереть пример",
  week: "Неделя к неделе",
  weekLine: "Медиана осознанности {a} → {b}. Открытия {c} → {d}.",
  language: "Язык",
  english: "English",
  russian: "Русский",
  theme: "Тема",
  ink: "Чернила",
  paper: "Бумага",
  system: "Как на устройстве",
  breath: "Вдох",
  seconds: "с",
  triggers: "Триггеры",
  export: "Экспорт",
  import: "Импорт",
  erase: "Стереть запись",
  eraseConfirm: "Стереть. Только это устройство.",
  cancel: "Отмена",
  badFile: "Этот файл — не запись Supacon, которую понимает эта версия.",
  cannot:
    "Эта страница не может встать перед другим приложением. Сначала открой Supacon или поставь значок рядом с тем, что тянет.",
  restart: "Начать семь дней заново. История останется.",
  windows: "До трёх окон",
  windowsLine: "Пишутся, пока спокойно. Пауза напомнит про окно. Дверь она не запрет.",
  night: "Ночной час",
  nightOff: "Нет",
  replace: "Замена своими словами",
  planLine: "Пауза это упоминает. Она тебя не останавливает.",
  nightNow: "Ночной час. Телефон можно оставить вне досягаемости.",
  windowNow: "Сейчас открыто одно из заданных окон.",
  back: "Назад",
  done: "Готово",
  missLine: "Пропуск — это данные. Штрафа нет.",
  missScore: "Вспомненный счёт, если он есть",
  missSeek: "Имя желания, если вспоминается",
  presets: {
    instagram: "Instagram",
    youtube: "YouTube",
    telegram: "Telegram",
    browser: "Браузер",
    other: "Что-то ещё",
  },
  seeking: {
    boredom: "Скука",
    validation: "Подтверждение",
    information: "Информация",
    habit: "Привычка",
    relief: "Облегчение",
    connection: "Связь",
    stimulation: "Стимул",
    status: "Статус",
    loss: "Не упустить",
    other: "Другое",
  },
  postSeeking: {
    seen: "Чтобы увидели",
    truth: "Сказать",
    habit: "Привычка",
    anxiety: "Тревога",
    unsure: "Неясно",
  },
  choices: {
    open: "Открыть",
    postpone: "Отложить",
    close: "Закрыть",
    post: "Публикация",
    draft: "Черновик",
    dont: "Без публикации",
  },
  hints: {
    over: "Лимит сессий на сегодня уже выбран. Открытие всё равно останется в записи.",
    high: "При ясном счёте открытие всё ещё случается почти всегда. Пауза это показывает, не запрещает.",
    spacious: "Между импульсом и касанием есть место.",
    low: "На низком счёте открытие случается почти всегда. Это наблюдение, не приговор.",
    emptyPostpone: "Последние откладывания этого желания не стали сессией.",
    loud: "Этот час обычно самый громкий.",
  },
  functions: {
    approval: "Ведущая тяга — одобрение.",
    status: "Ведущая тяга — статус.",
    belonging: "Ведущая тяга — принадлежность.",
    novelty: "Ведущая тяга — новизна.",
    relief: "Ведущая тяга — облегчение.",
    loss: "Ведущая тяга — не пропустить следующее.",
  },
  replacements: {
    approval: "Одно предложение человеку, не ленте.",
    status: "Число сегодня не двигает твоё положение.",
    belonging: "Один голос тому, кто знает твоё имя.",
    novelty: "Одна конечная вещь с концом. Потом стоп.",
    relief: "Десять вдохов или вода, потом снова взгляд.",
    loss: "Следующая проверка — не та, что всё закончит.",
    other: "Назови конечный следующий шаг, и это не лента.",
  },
  insights: {
    threshold:
      "Ниже {cut} открытие случается в {below} случаев. От {cut} и выше — в {above}.",
    seeking: "Когда осознанность была 4 или ниже, обычное имя — {name}.",
    naming: "После имени второй счёт сдвигался в среднем на {delta}.",
    baseline: "Дни 1–2 в среднем {early}. Дни 5–7 в среднем {late}.",
    loud: "Самый громкий час — {hour}:00.",
    posts: "Пауз перед публикацией: {total}. Шаг назад: {back}.",
    highOpens: "Осознанность высокая, а открытие всё ещё случается чаще всего.",
    wanting:
      "Половина или больше законченных сессий не дали того, чего искали. Желание и удовольствие — не одно и то же.",
    unfinished: "У половины или больше открытий не было строки, как выглядит «достаточно».",
    moved: "Тяга сдвинулась. Ведущий триггер уже не тот, с которого начиналось.",
  },
};

export const copy: Record<Locale, Copy> = { en, ru };

export function fill(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) =>
    vars[key] == null ? "" : String(vars[key]),
  );
}

export function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}
