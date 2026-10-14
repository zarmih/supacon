import type { Copy } from "@/lib/supacon/copy";
import {
  capOn,
  experimentKey,
  localDate,
  mean,
  phase,
  protocolDay,
  round1,
  seekingWhenLow,
  sessionsUsed,
} from "@/lib/supacon/domain";
import { activeFocus, activeSession, setMode } from "@/lib/supacon/store";
import type { Doc } from "@/lib/supacon/types";
import { QuietButton, Row, Screen, Title, triggerLabel, useNow } from "./ui";

export type Dest =
  | "pause"
  | "post"
  | "session"
  | "morning"
  | "evening"
  | "focus"
  | "plan"
  | "miss"
  | "insights";

export function Today({
  doc,
  t,
  onGo,
}: {
  doc: Doc;
  t: Copy;
  onGo: (dest: Dest) => void;
}) {
  const now = useNow(true);
  const today = localDate(now);
  const day = protocolDay(doc.protocolStart, today);
  const current = phase(day, doc.mode);
  const capped = capOn(day, doc.mode);
  const used = sessionsUsed(doc.sessions, today);
  const session = activeSession(doc);
  const focus = activeFocus(doc);
  const scores = doc.pauses
    .filter((p) => p.kind === "browse" && !p.missed && localDate(p.at) === today)
    .map((p) => p.score);
  const yScores = doc.pauses
    .filter((p) => {
      if (p.kind !== "browse" || p.missed) return false;
      return localDate(p.at) === localDate(now - 86_400_000);
    })
    .map((p) => p.score);
  const avg = mean(scores);
  const yAvg = mean(yScores);
  const low = seekingWhenLow(doc.pauses);
  const exp = experimentKey(doc, today);
  const hour = new Date(now).getHours();
  const minute = String(new Date(now).getMinutes()).padStart(2, "0");
  const windowOpen = doc.windows.includes(`${String(hour).padStart(2, "0")}:${minute}`);

  const kicker =
    day == null
      ? t.phases.practice
      : `${t.day} ${day} · ${t.phases[current]}`;

  return (
    <Screen>
      <Title kicker={kicker}>{t.notice}</Title>
      {doc.mode === "maintenance" ? (
        <p className="mt-4 text-sm text-pretty text-muted">{t.maintenanceLine}</p>
      ) : null}
      {doc.mode === "open" ? (
        <p className="mt-4 text-sm text-pretty text-muted">{t.openLine}</p>
      ) : null}
      {exp != null ? (
        <p className="mt-4 text-sm text-pretty text-muted">{t.experiments[exp]}</p>
      ) : null}
      {windowOpen ? <p className="mt-4 text-sm text-muted">{t.windowNow}</p> : null}
      {doc.nightHour === hour ? <p className="mt-4 text-sm text-muted">{t.nightNow}</p> : null}

      <div className="mt-8">
        <button
          type="button"
          onClick={() => onGo(session ? "session" : "pause")}
          className="min-h-14 w-full rounded-card bg-accent text-base font-medium text-accent-fg"
        >
          {session ? t.running : t.pause}
        </button>
      </div>

      <ul className="mt-4 space-y-2">
        {Object.entries(doc.postponeUntil)
          .filter(([, until]) => until > now)
          .map(([id, until]) => (
            <li key={id} className="text-sm text-muted">
              {triggerLabel(doc, id, t)} {t.postponed} · {Math.ceil((until - now) / 60_000)} {t.min}
            </li>
          ))}
      </ul>

      {current === "choose" ? (
        <div className="mt-8">
          <p className="text-sm text-pretty text-muted">{t.chooseMode}</p>
          <div className="mt-3 flex flex-col gap-2">
            <QuietButton onClick={() => setMode("maintenance")}>{t.maintenance}</QuietButton>
            <QuietButton onClick={() => setMode("deepening")}>{t.deepening}</QuietButton>
            <QuietButton onClick={() => setMode("open")}>{t.openMode}</QuietButton>
          </div>
        </div>
      ) : null}

      <dl className="mt-8 divide-y divide-line border-y border-line">
        <Row label={t.pausesToday} value={String(scores.length)} />
        <Row
          label={t.sessions}
          value={capped ? `${used} / ${doc.sessionCap}` : t.noCap}
        />
        <Row
          label={t.awareness}
          value={
            avg == null
              ? t.none
              : `${round1(avg)}${yAvg == null ? "" : ` · ${t.yesterday} ${round1(yAvg)}`}`
          }
        />
      </dl>

      {low ? (
        <p className="mt-6 text-sm text-pretty text-muted">
          {t.lowSeeking} {t.seeking[low] ?? low}.
        </p>
      ) : null}

      <div className="mt-6 divide-y divide-line border-y border-line">
        <Link label={t.morning} onClick={() => onGo("morning")} />
        <Link label={focus ? t.running : t.focus} onClick={() => onGo("focus")} />
        <Link label={t.evening} onClick={() => onGo("evening")} />
        <Link label={t.plan} onClick={() => onGo("plan")} />
        <Link label={t.beforePost} onClick={() => onGo("post")} />
        <Link label={t.miss} onClick={() => onGo("miss")} />
      </div>
    </Screen>
  );
}

function Link({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-14 w-full items-center justify-between text-left text-base"
    >
      <span>{label}</span>
      <span className="text-muted" aria-hidden>
        →
      </span>
    </button>
  );
}
