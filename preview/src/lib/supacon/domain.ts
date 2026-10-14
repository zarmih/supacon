import type {
  Choice,
  Doc,
  Pause,
  Seeking,
  Session,
} from "./types";

export function localDate(ts = Date.now()): string {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function protocolDay(start: string | null, today = localDate()): number | null {
  if (!start) return null;
  const a = Date.parse(`${start}T00:00:00`);
  const b = Date.parse(`${today}T00:00:00`);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  const diff = Math.round((b - a) / 86_400_000);
  return Math.max(1, diff + 1);
}

export type Phase =
  | "calibration"
  | "boundary"
  | "contrast"
  | "diagnosis"
  | "choose"
  | "practice";

export function phase(day: number | null, mode: Doc["mode"]): Phase {
  if (day === null) return "practice";
  if (day <= 2) return "calibration";
  if (day <= 4) return "boundary";
  if (day <= 6) return "contrast";
  if (day === 7) return "diagnosis";
  if (!mode) return "choose";
  return "practice";
}

/** Days 1–2 have no cap. Day 8+ keeps the cap until a mode turns it off. */
export function capOn(day: number | null, mode: Doc["mode"]): boolean {
  if (mode === "open") return false;
  if (day === null) return false;
  if (day <= 2) return false;
  return true;
}

export function browsePauses(pauses: Pause[]): Pause[] {
  return pauses.filter((p) => p.kind === "browse" && !p.missed);
}

export function onDate<T extends { at?: number; startedAt?: number; date?: string }>(
  items: T[],
  date: string,
  field: "at" | "startedAt" = "at",
): T[] {
  return items.filter((item) => {
    if (item.date) return item.date === date;
    const ts = field === "startedAt" ? item.startedAt : item.at;
    return ts != null && localDate(ts) === date;
  });
}

export function sessionsUsed(sessions: Session[], date: string): number {
  return sessions.filter(
    (s) => !s.overLimit && localDate(s.startedAt) === date,
  ).length;
}

export function mean(nums: number[]): number | null {
  if (!nums.length) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export type Threshold = { cut: number; below: number; above: number };

export function threshold(pauses: Pause[]): Threshold | null {
  const browse = browsePauses(pauses);
  let best: { cut: number; gap: number; below: number; above: number } | null =
    null;
  for (let cut = 2; cut <= 9; cut++) {
    const low = browse.filter((p) => p.score < cut);
    const high = browse.filter((p) => p.score >= cut);
    if (low.length < 4 || high.length < 4) continue;
    const below = low.filter((p) => p.choice === "open").length / low.length;
    const above = high.filter((p) => p.choice === "open").length / high.length;
    const gap = below - above;
    if (gap < 0.15) continue;
    if (
      !best ||
      gap > best.gap + 1e-9 ||
      (Math.abs(gap - best.gap) < 1e-9 && cut > best.cut)
    ) {
      best = { cut, gap, below, above };
    }
  }
  return best
    ? { cut: best.cut, below: best.below, above: best.above }
    : null;
}

export function seekingWhenLow(pauses: Pause[]): string | null {
  const counts = new Map<string, number>();
  for (const p of browsePauses(pauses)) {
    if (p.score > 4) continue;
    const key = p.seekingNote?.trim() || p.seeking;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  let best: { key: string; n: number } | null = null;
  for (const [key, n] of counts) {
    if (n < 2) continue;
    if (!best || n > best.n) best = { key, n };
  }
  return best?.key ?? null;
}

export function namingMove(pauses: Pause[]): number | null {
  const deltas = browsePauses(pauses)
    .filter((p) => p.secondScore != null)
    .map((p) => (p.secondScore as number) - p.score);
  if (deltas.length < 3) return null;
  const avg = mean(deltas) as number;
  if (Math.abs(avg) < 0.2) return null;
  return avg;
}

export function dayNumber(doc: Doc, at: number): number | null {
  return protocolDay(doc.protocolStart, localDate(at));
}

export function baseline(doc: Doc): { early: number; late: number } | null {
  if (!doc.protocolStart) return null;
  const early: number[] = [];
  const late: number[] = [];
  for (const p of browsePauses(doc.pauses)) {
    const day = dayNumber(doc, p.at);
    if (day == null) continue;
    if (day <= 2) early.push(p.score);
    else if (day >= 5 && day <= 7) late.push(p.score);
  }
  if (early.length < 3 || late.length < 3) return null;
  return { early: mean(early) as number, late: mean(late) as number };
}

export function loudHour(pauses: Pause[]): number | null {
  const counts = new Map<number, number>();
  for (const p of browsePauses(pauses)) {
    const h = new Date(p.at).getHours();
    counts.set(h, (counts.get(h) ?? 0) + 1);
  }
  let best: { h: number; n: number } | null = null;
  for (const [h, n] of counts) {
    if (n < 4) continue;
    if (!best || n > best.n) best = { h, n };
  }
  return best?.h ?? null;
}

const FUNCTION: Partial<Record<Seeking, string>> = {
  validation: "approval",
  status: "status",
  connection: "belonging",
  stimulation: "novelty",
  information: "novelty",
  relief: "relief",
  boredom: "relief",
  loss: "loss",
};

export function functionOf(seeking: string): string {
  return FUNCTION[seeking as Seeking] ?? "other";
}

export function leadingFunction(pauses: Pause[]): string | null {
  const counts = new Map<string, number>();
  for (const p of browsePauses(pauses)) {
    const fn = FUNCTION[p.seeking as Seeking];
    if (!fn) continue;
    counts.set(fn, (counts.get(fn) ?? 0) + 1);
  }
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  if (!ranked.length || ranked[0][1] < 3) return null;
  if (ranked[1] && ranked[1][1] === ranked[0][1]) return null;
  return ranked[0][0];
}

export function pullMoved(pauses: Pause[]): boolean {
  const browse = browsePauses(pauses);
  if (browse.length < 8) return false;
  const mid = Math.floor(browse.length / 2);
  const top = (slice: Pause[]) => {
    const counts = new Map<string, number>();
    for (const p of slice) counts.set(p.triggerId, (counts.get(p.triggerId) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  };
  const a = top(browse.slice(0, mid));
  const b = top(browse.slice(mid));
  return Boolean(a && b && a !== b && mid >= 4 && browse.length - mid >= 4);
}

export type Insight =
  | { kind: "threshold"; cut: number; below: number; above: number }
  | { kind: "seeking"; name: string }
  | { kind: "naming"; delta: number }
  | { kind: "baseline"; early: number; late: number }
  | { kind: "loud"; hour: number }
  | { kind: "posts"; total: number; back: number }
  | { kind: "highOpens" }
  | { kind: "wanting" }
  | { kind: "unfinished" }
  | { kind: "function"; name: string }
  | { kind: "moved" };

export function letter(doc: Doc): Insight[] {
  const out: Insight[] = [];
  const browse = browsePauses(doc.pauses);
  const cut = threshold(doc.pauses);
  if (cut) out.push({ kind: "threshold", ...cut });

  if (browse.length >= 6) {
    const avg = mean(browse.map((p) => p.score)) as number;
    const openRate = browse.filter((p) => p.choice === "open").length / browse.length;
    if (avg >= 7.5 && openRate >= 0.75) out.push({ kind: "highOpens" });
  }

  const answered = doc.sessions.filter((s) => s.delivered);
  if (answered.length >= 4) {
    const thin = answered.filter((s) => s.delivered !== "yes").length / answered.length;
    if (thin >= 0.5) out.push({ kind: "wanting" });
  }

  const opens = browse.filter((p) => p.choice === "open");
  if (opens.length >= 4) {
    const bare = opens.filter((p) => !p.enough?.trim()).length / opens.length;
    if (bare >= 0.5) out.push({ kind: "unfinished" });
  }

  const low = seekingWhenLow(doc.pauses);
  if (low) out.push({ kind: "seeking", name: low });

  const fn = leadingFunction(doc.pauses);
  if (fn) out.push({ kind: "function", name: fn });

  const delta = namingMove(doc.pauses);
  if (delta != null) out.push({ kind: "naming", delta });

  const base = baseline(doc);
  if (base) out.push({ kind: "baseline", ...base });

  const posts = doc.pauses.filter((p) => p.kind === "post");
  if (posts.length >= 2) {
    const back = posts.filter((p) => p.choice === "draft" || p.choice === "dont").length;
    out.push({ kind: "posts", total: posts.length, back });
  }

  if (pullMoved(doc.pauses)) out.push({ kind: "moved" });

  const hour = loudHour(doc.pauses);
  if (hour != null) out.push({ kind: "loud", hour });

  return out.slice(0, 4);
}

export type WeekCompare = {
  awareness: [number, number];
  opens: [number, number];
};

function spanStats(pauses: Pause[], from: number, to: number) {
  const slice = browsePauses(pauses).filter((p) => p.at >= from && p.at < to);
  if (slice.length < 4) return null;
  const scores = [...slice.map((p) => p.score)].sort((a, b) => a - b);
  const mid = Math.floor(scores.length / 2);
  const median =
    scores.length % 2 ? scores[mid] : (scores[mid - 1] + scores[mid]) / 2;
  const opens = slice.filter((p) => p.choice === "open").length / slice.length;
  return { median, opens };
}

export function weekCompare(doc: Doc, now = Date.now()): WeekCompare | null {
  const end = new Date(now);
  end.setHours(24, 0, 0, 0);
  const endMs = end.getTime();
  const week = 7 * 86_400_000;
  const recent = spanStats(doc.pauses, endMs - week, endMs);
  const prior = spanStats(doc.pauses, endMs - 2 * week, endMs - week);
  if (!recent || !prior) return null;
  return {
    awareness: [prior.median, recent.median],
    opens: [prior.opens, recent.opens],
  };
}

export type HintKind =
  | "over"
  | "high"
  | "spacious"
  | "low"
  | "emptyPostpone"
  | "loud";

export function chooseHint(
  doc: Doc,
  score: number,
  seeking: string,
  now = Date.now(),
): HintKind | null {
  const today = localDate(now);
  const day = protocolDay(doc.protocolStart, today);
  const over =
    capOn(day, doc.mode) &&
    sessionsUsed(doc.sessions, today) >= doc.sessionCap;
  const browse = browsePauses(doc.pauses);
  if (browse.length < 6) return over ? "over" : null;

  if (over) return "over";

  if (score >= 7 && browse.length >= 6) {
    const avg = mean(browse.map((p) => p.score)) as number;
    const openRate =
      browse.filter((p) => p.choice === "open").length / browse.length;
    if (avg >= 7.5 && openRate >= 0.75) return "high";
  }

  if (score >= 8) return "spacious";

  const low = browse.filter((p) => p.score <= 4);
  if (low.length >= 5) {
    const rate = low.filter((p) => p.choice === "open").length / low.length;
    if (rate >= 0.7) return "low";
  }

  const postpones = browse
    .filter((p) => p.seeking === seeking && p.choice === "postpone")
    .slice(-3);
  if (postpones.length === 3) {
    const empty = postpones.every((p) => {
      return !doc.sessions.some(
        (s) =>
          s.triggerId === p.triggerId &&
          s.startedAt >= p.at &&
          s.startedAt <= p.at + 90 * 60_000,
      );
    });
    if (empty) return "emptyPostpone";
  }

  const hour = loudHour(doc.pauses);
  if (hour != null && new Date(now).getHours() === hour) return "loud";
  return null;
}

export function experimentKey(doc: Doc, today = localDate()): number | null {
  if (doc.mode !== "deepening" || !doc.protocolStart) return null;
  const day = protocolDay(doc.protocolStart, today);
  if (day == null || day < 8) return null;
  return Math.floor((day - 8) / 7) % 5;
}

export function dailyMeans(doc: Doc, today = localDate()): Array<number | null> {
  const end = Date.parse(`${today}T00:00:00`);
  const out: Array<number | null> = [];
  for (let i = 6; i >= 0; i--) {
    const date = localDate(end - i * 86_400_000);
    const scores = browsePauses(doc.pauses)
      .filter((p) => localDate(p.at) === date)
      .map((p) => p.score);
    out.push(mean(scores));
  }
  return out;
}

export function isOpenChoice(choice: Choice): boolean {
  return choice === "open" || choice === "post";
}
