import { useState } from "react";
import type { Copy } from "@/lib/supacon/copy";
import { localDate, loudHour, phase, protocolDay } from "@/lib/supacon/domain";
import {
  activeFocus,
  activeSession,
  endFocus,
  endSession,
  extendSession,
  logMiss,
  saveEvening,
  saveMorning,
  setNightHour,
  setReplacement,
  setWindows,
  startFocus,
} from "@/lib/supacon/store";
import { SEEKING, type Doc, type Seeking } from "@/lib/supacon/types";
import { AccentButton, Back, Field, QuietButton, Screen, Title, triggerLabel, useNow, mmss } from "./ui";

export function SessionScreen({ doc, t, onDone }: { doc: Doc; t: Copy; onDone: () => void }) {
  const session = activeSession(doc);
  const now = useNow(Boolean(session && !session.delivered));
  const [ask, setAsk] = useState(false);
  if (!session) {
    return (
      <Screen>
        <Title>{t.logged}</Title>
        <div className="mt-8">
          <AccentButton onClick={onDone}>{t.done}</AccentButton>
        </div>
      </Screen>
    );
  }
  const left = session.endsAt - now;
  if (ask) {
    return (
      <Screen>
        <Title kicker={triggerLabel(doc, session.triggerId, t)}>{t.delivered}</Title>
        <div className="mt-8 flex flex-col gap-2">
          {(["yes", "partly", "no"] as const).map((value) => (
            <QuietButton
              key={value}
              onClick={() => {
                endSession(session.id, value);
                onDone();
              }}
            >
              {t[value]}
            </QuietButton>
          ))}
        </div>
      </Screen>
    );
  }
  return (
    <Screen
      footer={
        <div className="flex flex-col gap-2">
          <QuietButton onClick={() => extendSession(session.id)}>{t.extend}</QuietButton>
          <AccentButton onClick={() => setAsk(true)}>{t.endSession}</AccentButton>
        </div>
      }
    >
      <Title kicker={triggerLabel(doc, session.triggerId, t)}>
        {left <= 0 ? t.windowOver : t.session}
      </Title>
      <p className="mt-8 font-serif text-6xl tabular-nums">{mmss(left)}</p>
      {session.enough ? (
        <p className="mt-6 text-sm text-muted">
          {t.enoughWas}: {session.enough}
        </p>
      ) : null}
      {session.overLimit ? <p className="mt-4 text-sm text-muted">{t.over}</p> : null}
    </Screen>
  );
}

export function MorningScreen({ doc, t, onDone }: { doc: Doc; t: Copy; onDone: () => void }) {
  const existing = doc.mornings.find((item) => item.date === localDate());
  const [score, setScore] = useState(existing?.score ?? 0);
  const [desire, setDesire] = useState(existing?.desire ?? "");
  return (
    <Screen
      footer={
        <AccentButton
          disabled={!score || !desire.trim()}
          onClick={() => {
            saveMorning(score, desire);
            onDone();
          }}
        >
          {t.save}
        </AccentButton>
      }
    >
      <Back label={t.back} onClick={onDone} />
      <Title kicker={t.breaths}>{t.morning}</Title>
      <div className="mt-8 grid grid-cols-5 gap-2">
        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setScore(n)}
            className={`min-h-14 rounded-card text-lg tabular-nums ${score === n ? "bg-accent text-accent-fg" : "bg-quiet"}`}
          >
            {n}
          </button>
        ))}
      </div>
      <div className="mt-6">
        <Field label={t.desire} value={desire} onChange={setDesire} />
      </div>
    </Screen>
  );
}

export function EveningScreen({ doc, t, onDone }: { doc: Doc; t: Copy; onDone: () => void }) {
  const today = localDate();
  const existing = doc.evenings.find((item) => item.date === today);
  const day = protocolDay(doc.protocolStart, today);
  const current = phase(day, doc.mode);
  const [lowest, setLowest] = useState(existing?.lowest ?? "");
  const [note, setNote] = useState(existing?.note ?? "");
  const [misses, setMisses] = useState(String(existing?.misses ?? 0));
  const [conversation, setConversation] = useState<boolean | undefined>(existing?.conversation);
  const [diagnosis, setDiagnosis] = useState(existing?.diagnosis ?? "");
  const pauses = doc.pauses.filter((p) => localDate(p.at) === today);
  return (
    <Screen
      footer={
        <AccentButton
          onClick={() => {
            saveEvening({
              lowest,
              note,
              misses: Number(misses) || 0,
              conversation,
              diagnosis,
            });
            onDone();
          }}
        >
          {t.save}
        </AccentButton>
      }
    >
      <Back label={t.back} onClick={onDone} />
      <Title>{t.evening}</Title>
      <ul className="mt-8 divide-y divide-line border-y border-line">
        {pauses.length === 0 ? (
          <li className="py-4 text-sm text-muted">{t.noPauses}</li>
        ) : (
          pauses.map((p) => (
            <li key={p.id} className="flex items-baseline justify-between gap-3 py-3 text-sm">
              <span>
                {triggerLabel(doc, p.triggerId, t)} · {t.choices[p.choice]}
                {p.missed ? ` · ${t.miss}` : ""}
              </span>
              <span className="tabular-nums">{p.score}</span>
            </li>
          ))
        )}
      </ul>
      <div className="mt-6 flex flex-col gap-4">
        <Field label={t.lowest} value={lowest} onChange={setLowest} />
        <Field label={t.note} value={note} onChange={setNote} />
        <Field label={t.misses} value={misses} onChange={setMisses} />
        {current === "contrast" ? (
          <div>
            <p className="text-sm text-muted">{t.conversation}</p>
            <div className="mt-2 flex gap-2">
              <QuietButton onClick={() => setConversation(true)}>{t.yes}</QuietButton>
              <QuietButton onClick={() => setConversation(false)}>{t.no}</QuietButton>
            </div>
          </div>
        ) : null}
        {current === "diagnosis" || (day != null && day >= 7) ? (
          <Field label={t.diagnosis} value={diagnosis} onChange={setDiagnosis} />
        ) : null}
      </div>
    </Screen>
  );
}

export function FocusScreen({ doc, t, onDone }: { doc: Doc; t: Copy; onDone: () => void }) {
  const focus = activeFocus(doc);
  const now = useNow(Boolean(focus));
  const hour = loudHour(doc.pauses);
  const day = protocolDay(doc.protocolStart, localDate(now));
  if (!focus) {
    return (
      <Screen
        footer={<AccentButton onClick={() => startFocus()}>{t.start}</AccentButton>}
      >
        <Back label={t.back} onClick={onDone} />
        <Title>{t.focus}</Title>
        <p className="mt-4 text-sm text-pretty text-muted">{t.focusLine}</p>
        {hour != null && day != null && day >= 5 && day <= 6 ? (
          <p className="mt-4 text-sm text-muted">{t.loudSuggest.replace("{hour}", String(hour))}</p>
        ) : null}
      </Screen>
    );
  }
  const left = focus.startedAt + focus.minutes * 60_000 - now;
  return (
    <Screen footer={<AccentButton onClick={() => { endFocus(); onDone(); }}>{t.end}</AccentButton>}>
      <Title>{left <= 0 ? t.windowOver : t.focus}</Title>
      <p className="mt-8 font-serif text-6xl tabular-nums">{mmss(left)}</p>
      <p className="mt-4 text-sm text-muted">{t.focusLine}</p>
    </Screen>
  );
}

export function MissScreen({ t, onDone }: { t: Copy; onDone: () => void }) {
  const [score, setScore] = useState<number | null>(null);
  const [seeking, setSeeking] = useState("habit");
  return (
    <Screen
      footer={
        <AccentButton
          onClick={() => {
            logMiss(score, seeking);
            onDone();
          }}
        >
          {t.save}
        </AccentButton>
      }
    >
      <Back label={t.back} onClick={onDone} />
      <Title>{t.miss}</Title>
      <p className="mt-4 text-sm text-muted">{t.missLine}</p>
      <p className="mt-8 text-sm text-muted">{t.missScore}</p>
      <div className="mt-3 grid grid-cols-5 gap-2">
        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setScore(n)}
            className={`min-h-12 rounded-card tabular-nums ${score === n ? "bg-accent text-accent-fg" : "bg-quiet"}`}
          >
            {n}
          </button>
        ))}
      </div>
      <p className="mt-6 text-sm text-muted">{t.missSeek}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {SEEKING.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setSeeking(key)}
            className={`min-h-11 rounded-full px-4 text-sm ${seeking === key ? "bg-accent text-accent-fg" : "bg-quiet"}`}
          >
            {t.seeking[key]}
          </button>
        ))}
      </div>
    </Screen>
  );
}

const PLAN_KEYS: Seeking[] = [
  "validation",
  "status",
  "connection",
  "stimulation",
  "relief",
  "loss",
];

export function PlanScreen({ doc, t, onDone }: { doc: Doc; t: Copy; onDone: () => void }) {
  const [windows, setLocal] = useState<string[]>([
    doc.windows[0] ?? "",
    doc.windows[1] ?? "",
    doc.windows[2] ?? "",
  ]);
  return (
    <Screen
      footer={
        <AccentButton
          onClick={() => {
            setWindows(windows);
            onDone();
          }}
        >
          {t.save}
        </AccentButton>
      }
    >
      <Back label={t.back} onClick={onDone} />
      <Title>{t.plan}</Title>
      <p className="mt-4 text-sm text-pretty text-muted">{t.windowsLine}</p>
      <p className="mt-8 text-sm text-muted">{t.windows}</p>
      <div className="mt-3 flex flex-col gap-2">
        {windows.map((value, index) => (
          <input
            key={index}
            type="time"
            value={value}
            onChange={(event) => {
              const next = [...windows];
              next[index] = event.target.value;
              setLocal(next);
            }}
            className="min-h-11 rounded-card border border-line bg-surface px-4 text-fg"
          />
        ))}
      </div>
      <p className="mt-8 text-sm text-muted">{t.night}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setNightHour(null)}
          className={`min-h-11 rounded-full px-4 text-sm ${doc.nightHour == null ? "bg-accent text-accent-fg" : "bg-quiet"}`}
        >
          {t.nightOff}
        </button>
        {Array.from({ length: 24 }, (_, hour) => (
          <button
            key={hour}
            type="button"
            onClick={() => setNightHour(hour)}
            className={`min-h-11 rounded-full px-3 text-sm tabular-nums ${doc.nightHour === hour ? "bg-accent text-accent-fg" : "bg-quiet"}`}
          >
            {hour}
          </button>
        ))}
      </div>
      <p className="mt-8 text-sm text-muted">{t.replace}</p>
      <div className="mt-3 flex flex-col gap-3">
        {PLAN_KEYS.map((key) => (
          <Field
            key={key}
            label={t.seeking[key]}
            value={doc.replacements[key] ?? ""}
            onChange={(value) => setReplacement(key, value)}
          />
        ))}
      </div>
      <p className="mt-4 text-sm text-muted">{t.planLine}</p>
    </Screen>
  );
}
