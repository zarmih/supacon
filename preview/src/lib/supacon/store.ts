import {
  capOn,
  localDate,
  protocolDay,
  sessionsUsed,
} from "./domain";
import type {
  Doc,
  FocusBlock,
  Locale,
  Mode,
  Pause,
  Seeking,
  Session,
  ThemeSetting,
  Trigger,
} from "./types";
import { PRESET_IDS } from "./types";

export const STORAGE_KEY = "supacon.preview.v1";

type Listener = () => void;
const listeners = new Set<Listener>();
let memory: Doc | null = null;
let ready = false;
let message: string | null = null;

function emit() {
  for (const fn of listeners) fn();
}

export function subscribe(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getDoc(): Doc | null {
  return memory;
}

export function isReady(): boolean {
  return ready;
}

export function getMessage(): string | null {
  return message;
}

export function clearMessage() {
  message = null;
  emit();
}

export function setMessage(text: string) {
  message = text;
  emit();
}

function isDoc(value: unknown): value is Doc {
  if (!value || typeof value !== "object") return false;
  const doc = value as Doc;
  return (
    doc.version === 1 &&
    Array.isArray(doc.triggers) &&
    Array.isArray(doc.pauses) &&
    Array.isArray(doc.sessions)
  );
}

export function load() {
  ready = true;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      memory = null;
      emit();
      return;
    }
    const parsed: unknown = JSON.parse(raw);
    if (!isDoc(parsed)) {
      localStorage.setItem(`${STORAGE_KEY}.bak`, raw);
      memory = null;
      emit();
      return;
    }
    memory = parsed;
  } catch {
    memory = null;
  }
  emit();
}

function persist(doc: Doc | null) {
  memory = doc;
  if (doc) localStorage.setItem(STORAGE_KEY, JSON.stringify(doc));
  else localStorage.removeItem(STORAGE_KEY);
  emit();
}

function update(fn: (doc: Doc) => Doc) {
  if (!memory) return;
  persist(fn(memory));
}

export function presetTriggers(selected: string[]): Trigger[] {
  const presets: Trigger[] = PRESET_IDS.map((id) => ({
    id,
    name: id,
    preset: true,
    enabled: selected.includes(id),
  }));
  if (!presets.some((t) => t.enabled)) {
    const other = presets.find((t) => t.id === "other");
    if (other) other.enabled = true;
  }
  return presets;
}

export function begin(opts: {
  selected: string[];
  custom: string[];
  skip: boolean;
  locale: Locale;
}) {
  const triggers = presetTriggers(opts.selected);
  for (const name of opts.custom) {
    const trimmed = name.trim();
    if (!trimmed) continue;
    triggers.push({
      id: crypto.randomUUID(),
      name: trimmed,
      preset: false,
      enabled: true,
    });
  }
  const doc: Doc = {
    version: 1,
    createdAt: Date.now(),
    protocolStart: opts.skip ? null : localDate(),
    mode: opts.skip ? "open" : null,
    triggers,
    breathSeconds: 10,
    sessionMinutes: 15,
    sessionCap: 3,
    locale: opts.locale,
    theme: "ink",
    pauses: [],
    sessions: [],
    mornings: [],
    evenings: [],
    focuses: [],
    windows: [],
    nightHour: null,
    replacements: {},
    postponeUntil: {},
  };
  persist(doc);
}

export function toggleTrigger(id: string) {
  update((doc) => {
    const triggers = doc.triggers.map((t) => ({ ...t }));
    const target = triggers.find((t) => t.id === id);
    if (!target) return doc;
    if (target.enabled && triggers.filter((t) => t.enabled).length <= 1) return doc;
    target.enabled = !target.enabled;
    return { ...doc, triggers };
  });
}

export function addTrigger(name: string) {
  const trimmed = name.trim();
  if (!trimmed) return;
  update((doc) => ({
    ...doc,
    triggers: [
      ...doc.triggers,
      { id: crypto.randomUUID(), name: trimmed, preset: false, enabled: true },
    ],
  }));
}

export function setLocale(locale: Locale) {
  update((doc) => ({ ...doc, locale }));
}

export function setTheme(theme: ThemeSetting) {
  update((doc) => ({ ...doc, theme }));
}

export function setBreath(seconds: 5 | 10 | 15) {
  update((doc) => ({ ...doc, breathSeconds: seconds }));
}

export function setMode(mode: Mode) {
  update((doc) => ({ ...doc, mode }));
}

export function restartProtocol() {
  update((doc) => ({ ...doc, protocolStart: localDate(), mode: null }));
}

export function setWindows(windows: string[]) {
  update((doc) => ({
    ...doc,
    windows: windows.filter(Boolean).slice(0, 3),
  }));
}

export function setNightHour(hour: number | null) {
  update((doc) => ({ ...doc, nightHour: hour }));
}

export function setReplacement(key: Seeking, value: string) {
  update((doc) => ({
    ...doc,
    replacements: { ...doc.replacements, [key]: value },
  }));
}

export type ChooseInput = {
  triggerId: string;
  kind: "browse" | "post";
  score: number;
  seeking: string;
  seekingNote?: string;
  choice: Pause["choice"];
  enough?: string;
  startedAt: number;
};

export function commitChoice(
  input: ChooseInput,
  now = Date.now(),
): { pauseId: string; sessionId: string | null } | null {
  if (!memory) return null;
  const today = localDate(now);
  const day = protocolDay(memory.protocolStart, today);
  const over =
    input.kind === "browse" &&
    input.choice === "open" &&
    capOn(day, memory.mode) &&
    sessionsUsed(memory.sessions, today) >= memory.sessionCap;
  const pause: Pause = {
    id: crypto.randomUUID(),
    at: now,
    triggerId: input.triggerId,
    kind: input.kind,
    score: input.score,
    seeking: input.seeking,
    seekingNote: input.seekingNote?.trim() || undefined,
    choice: input.choice,
    enough: input.enough?.trim() || undefined,
    breathMs: Math.max(0, now - input.startedAt),
    overLimit: over,
  };
  let sessionId: string | null = null;
  const sessions = [...memory.sessions];
  if (input.choice === "open") {
    const session: Session = {
      id: crypto.randomUUID(),
      pauseId: pause.id,
      triggerId: input.triggerId,
      startedAt: now,
      endsAt: now + memory.sessionMinutes * 60_000,
      overLimit: over,
      enough: pause.enough,
      extraMinutes: 0,
    };
    sessions.push(session);
    sessionId = session.id;
  }
  const postponeUntil = { ...memory.postponeUntil };
  if (input.choice === "postpone") {
    postponeUntil[input.triggerId] = now + 30 * 60_000;
  } else {
    delete postponeUntil[input.triggerId];
  }
  persist({ ...memory, pauses: [...memory.pauses, pause], sessions, postponeUntil });
  return { pauseId: pause.id, sessionId };
}

export function setSecondScore(pauseId: string, score: number) {
  update((doc) => ({
    ...doc,
    pauses: doc.pauses.map((p) =>
      p.id === pauseId ? { ...p, secondScore: score } : p,
    ),
  }));
}

export function extendSession(id: string) {
  update((doc) => ({
    ...doc,
    sessions: doc.sessions.map((s) =>
      s.id === id && !s.endedAt
        ? {
            ...s,
            endsAt: s.endsAt + 5 * 60_000,
            extraMinutes: s.extraMinutes + 5,
          }
        : s,
    ),
  }));
}

export function endSession(id: string, delivered: Session["delivered"]) {
  const now = Date.now();
  update((doc) => ({
    ...doc,
    sessions: doc.sessions.map((s) =>
      s.id === id ? { ...s, endedAt: now, delivered } : s,
    ),
  }));
}

export function saveMorning(score: number, desire: string) {
  const date = localDate();
  update((doc) => {
    const mornings = doc.mornings.filter((m) => m.date !== date);
    mornings.push({ date, score, desire: desire.trim() });
    return { ...doc, mornings };
  });
}

export function saveEvening(input: {
  lowest: string;
  note: string;
  misses: number;
  conversation?: boolean;
  diagnosis?: string;
}) {
  const date = localDate();
  update((doc) => {
    const evenings = doc.evenings.filter((e) => e.date !== date);
    evenings.push({ date, ...input, misses: Math.max(0, input.misses) });
    return { ...doc, evenings };
  });
}

export function startFocus() {
  const now = Date.now();
  const block: FocusBlock = {
    id: crypto.randomUUID(),
    date: localDate(now),
    startedAt: now,
    minutes: 45,
  };
  update((doc) => ({
    ...doc,
    focuses: doc.focuses.map((f) =>
      f.endedAt ? f : { ...f, endedAt: now },
    ).concat(block),
  }));
}

export function endFocus() {
  const now = Date.now();
  update((doc) => ({
    ...doc,
    focuses: doc.focuses.map((f) => (f.endedAt ? f : { ...f, endedAt: now })),
  }));
}

export function logMiss(score: number | null, seeking: string) {
  const now = Date.now();
  update((doc) => ({
    ...doc,
    pauses: [
      ...doc.pauses,
      {
        id: crypto.randomUUID(),
        at: now,
        triggerId: doc.triggers.find((t) => t.enabled)?.id ?? "other",
        kind: "browse" as const,
        score: score ?? 1,
        seeking: seeking || "habit",
        choice: "open" as const,
        breathMs: 0,
        overLimit: false,
        missed: true,
      },
    ],
  }));
}

const EXAMPLE_SEEKING = [
  "boredom",
  "habit",
  "validation",
  "boredom",
  "stimulation",
  "information",
  "habit",
  "relief",
  "information",
  "connection",
  "habit",
] as const;

const EXAMPLE_SCORE = [3, 2, 4, 3, 4, 8, 9, 8, 7, 9, 8];
const EXAMPLE_CHOICE: Pause["choice"][] = [
  "open",
  "open",
  "open",
  "open",
  "open",
  "postpone",
  "close",
  "postpone",
  "close",
  "postpone",
  "close",
];

export function loadExample() {
  const now = Date.now();
  update((doc) => {
    const pauses = doc.pauses.filter((p) => !p.example);
    EXAMPLE_SCORE.forEach((score, i) => {
      pauses.push({
        id: `example-${i}`,
        at: now - (EXAMPLE_SCORE.length - i) * 3_600_000,
        triggerId: i % 2 === 0 ? "instagram" : "youtube",
        kind: "browse",
        score,
        seeking: EXAMPLE_SEEKING[i],
        choice: EXAMPLE_CHOICE[i],
        breathMs: 10_000,
        overLimit: false,
        example: true,
        secondScore: i < 3 ? score + 1 : undefined,
        enough: EXAMPLE_CHOICE[i] === "open" && i > 2 ? "one message" : undefined,
      });
    });
    const sessions: Session[] = doc.sessions.filter((s) => !s.pauseId.startsWith("example-"));
    pauses.forEach((p) => {
      if (!p.example || p.choice !== "open") return;
      sessions.push({
        id: `example-session-${p.id}`,
        pauseId: p.id,
        triggerId: p.triggerId,
        startedAt: p.at,
        endsAt: p.at + 15 * 60_000,
        endedAt: p.at + 8 * 60_000,
        delivered: p.enough ? "partly" : "no",
        overLimit: false,
        enough: p.enough,
        extraMinutes: 0,
      });
    });
    return { ...doc, pauses, sessions };
  });
}

export function eraseExample() {
  update((doc) => ({
    ...doc,
    pauses: doc.pauses.filter((p) => !p.example),
    sessions: doc.sessions.filter((s) => !s.pauseId.startsWith("example-")),
  }));
}

export function exportDoc() {
  if (!memory) return;
  const blob = new Blob([JSON.stringify(memory, null, 2)], {
    type: "application/json",
  });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `supacon-${localDate()}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function importDoc(raw: string): boolean {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isDoc(parsed)) return false;
    if (memory) localStorage.setItem(`${STORAGE_KEY}.bak`, JSON.stringify(memory));
    persist(parsed);
    return true;
  } catch {
    return false;
  }
}

export function eraseAll() {
  persist(null);
}

export function activeSession(doc: Doc): Session | undefined {
  return doc.sessions.find((s) => !s.endedAt);
}

export function activeFocus(doc: Doc): FocusBlock | undefined {
  return doc.focuses.find((f) => !f.endedAt);
}
