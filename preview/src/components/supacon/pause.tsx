import { useEffect, useMemo, useState } from "react";
import type { Copy } from "@/lib/supacon/copy";
import { chooseHint, functionOf } from "@/lib/supacon/domain";
import { commitChoice, setSecondScore } from "@/lib/supacon/store";
import { POST_SEEKING, SEEKING, type Doc, type Pause } from "@/lib/supacon/types";
import { Screen, Title, triggerLabel, useNow } from "./ui";

const REP: Record<string, string> = {
  approval: "validation",
  status: "status",
  belonging: "connection",
  novelty: "stimulation",
  relief: "relief",
  loss: "loss",
};

export function PauseFlow({
  doc,
  t,
  kind,
  onDone,
  onSession,
}: {
  doc: Doc;
  t: Copy;
  kind: "browse" | "post";
  onDone: () => void;
  onSession: () => void;
}) {
  const enabled = doc.triggers.filter((item) => item.enabled);
  const single = enabled.length === 1 ? enabled[0].id : "";
  const realBrowse = doc.pauses.filter(
    (p) => p.kind === "browse" && !p.missed && !p.example,
  ).length;
  const withArrive = kind === "browse" && realBrowse < 3;
  const [triggerId, setTriggerId] = useState(single);
  const [step, setStep] = useState<"pick" | "arrive" | "score" | "seek" | "choose" | "second" | "after">(
    single ? (withArrive ? "arrive" : "score") : "pick",
  );
  const [startedAt, setStartedAt] = useState<number | null>(single ? Date.now() : null);
  const [score, setScore] = useState<number | null>(null);
  const [seeking, setSeeking] = useState("");
  const [note, setNote] = useState("");
  const [enough, setEnough] = useState("");
  const [saved, setSaved] = useState<{ pauseId: string; choice: Pause["choice"] } | null>(null);
  const now = useNow(step === "choose" || step === "score" || step === "seek" || step === "arrive");

  const options = kind === "post" ? POST_SEEKING : SEEKING;
  const left = useMemo(() => {
    if (!startedAt) return doc.breathSeconds;
    return Math.max(0, doc.breathSeconds - Math.floor((now - startedAt) / 1000));
  }, [startedAt, now, doc.breathSeconds]);
  const unlocked = left === 0 && score != null && seeking !== "";
  const hint = score != null ? chooseHint(doc, score, seeking, now) : null;
  const over =
    kind === "browse" &&
    hint === "over";

  useEffect(() => {
    if (step !== "score" && step !== "second") return;
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      const n =
        event.key === "0" ? 10 : event.key >= "1" && event.key <= "9" ? Number(event.key) : 0;
      if (!n) return;
      if (step === "score") {
        setScore(n);
        setStep("seek");
      } else finishSecond(n);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function pickTrigger(id: string) {
    setTriggerId(id);
    setStartedAt(Date.now());
    setStep(withArrive ? "arrive" : "score");
  }

  function choose(choice: Pause["choice"]) {
    if (!unlocked || score == null || !triggerId || !startedAt) return;
    const result = commitChoice({
      triggerId,
      kind,
      score,
      seeking,
      seekingNote: seeking === "other" ? note : undefined,
      choice,
      enough,
      startedAt,
    });
    if (!result) return;
    setSaved({ pauseId: result.pauseId, choice });
    setStep("second");
    if (result.sessionId) {
      // session is already running; second score, then the session screen
    }
  }

  function finishSecond(next: number | null) {
    if (saved && next != null) setSecondScore(saved.pauseId, next);
    if (saved?.choice === "open") onSession();
    else setStep("after");
  }

  if (step === "pick") {
    return (
      <Screen>
        <Title>{t.pause}</Title>
        <div className="mt-8 flex flex-col gap-2">
          {enabled.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => pickTrigger(item.id)}
              className="min-h-14 rounded-card bg-quiet px-4 text-left text-base"
            >
              {triggerLabel(doc, item.id, t)}
            </button>
          ))}
        </div>
      </Screen>
    );
  }

  if (step === "arrive") {
    return (
      <Screen
        footer={
          <button
            type="button"
            onClick={() => setStep("score")}
            className="min-h-14 w-full rounded-card bg-accent text-base font-medium text-accent-fg"
          >
            {t.here}
          </button>
        }
      >
        <Title kicker={triggerLabel(doc, triggerId, t)}>{t.hereLine}</Title>
      </Screen>
    );
  }

  if (step === "score") {
    return (
      <Screen>
        <Title kicker={triggerLabel(doc, triggerId, t)}>{t.present}</Title>
        <p className="mt-3 text-sm text-muted">{t.notAuto}</p>
        <div className="mt-8 grid grid-cols-5 gap-2">
          {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              type="button"
              aria-label={`${n}`}
              onClick={() => {
                setScore(n);
                setStep("seek");
              }}
              className={`min-h-14 rounded-card text-lg tabular-nums ${score === n ? "bg-accent text-accent-fg" : "bg-quiet text-fg"}`}
            >
              {n}
            </button>
          ))}
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-muted">
          {t.bands.map((band) => (
            <span key={band}>{band}</span>
          ))}
        </div>
      </Screen>
    );
  }

  if (step === "seek") {
    return (
      <Screen>
        <Title>{kind === "post" ? t.postQ : t.seekingQ}</Title>
        <div className="mt-8 flex flex-wrap gap-2">
          {options.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => {
                setSeeking(key);
                if (key !== "other") setStep("choose");
              }}
              className={`min-h-11 rounded-full px-4 text-sm ${seeking === key ? "bg-accent text-accent-fg" : "bg-quiet text-fg"}`}
            >
              {kind === "post" ? t.postSeeking[key] : t.seeking[key]}
            </button>
          ))}
        </div>
        {seeking === "other" ? (
          <div className="mt-4">
            <input
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder={t.nameIt}
              className="min-h-11 w-full rounded-card border border-line bg-surface px-4 outline-none"
            />
            <button
              type="button"
              onClick={() => setStep("choose")}
              className="mt-3 min-h-11 text-sm text-fg"
            >
              {t.done}
            </button>
          </div>
        ) : null}
      </Screen>
    );
  }

  if (step === "choose") {
    const choices: Array<{ id: Pause["choice"]; label: string }> =
      kind === "post"
        ? [
            { id: "post", label: t.post },
            { id: "draft", label: t.draft },
            { id: "dont", label: t.dont },
          ]
        : [
            { id: "open", label: t.open },
            { id: "postpone", label: t.postpone },
            { id: "close", label: t.close },
          ];
    return (
      <Screen
        footer={
          <div className="grid grid-cols-1 gap-2">
            {choices.map((choice) => (
              <button
                key={choice.id}
                type="button"
                disabled={!unlocked}
                onClick={() => choose(choice.id)}
                className="min-h-12 rounded-card bg-quiet text-sm font-medium disabled:opacity-40"
              >
                {choice.label}
              </button>
            ))}
          </div>
        }
      >
        <p className="font-serif text-5xl tabular-nums">{left === 0 ? "" : left}</p>
        <p className="mt-2 text-sm text-muted">{left === 0 ? t.canChoose : t.stay}</p>
        {over ? <p className="mt-6 text-sm text-pretty text-muted">{t.over}</p> : null}
        {hint && hint !== "over" ? (
          <p className="mt-6 text-sm text-pretty text-muted">{t.hints[hint]}</p>
        ) : null}
        {doc.nightHour === new Date(now).getHours() ? (
          <p className="mt-4 text-sm text-muted">{t.nightNow}</p>
        ) : null}
        {kind === "browse" ? (
          <label className="mt-8 block">
            <span className="text-sm text-muted">{t.enough}</span>
            <input
              value={enough}
              onChange={(event) => setEnough(event.target.value)}
              className="mt-2 min-h-11 w-full rounded-card border border-line bg-surface px-4 outline-none"
            />
            <span className="mt-2 block text-sm text-muted">{t.enoughHint}</span>
          </label>
        ) : null}
      </Screen>
    );
  }

  if (step === "second") {
    return (
      <Screen>
        <Title>{t.moved}</Title>
        <div className="mt-8 grid grid-cols-5 gap-2">
          {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => finishSecond(n)}
              className="min-h-14 rounded-card bg-quiet text-lg tabular-nums"
            >
              {n}
            </button>
          ))}
        </div>
        <button type="button" onClick={() => finishSecond(null)} className="mt-6 min-h-11 text-sm text-muted">
          {t.skipScore}
        </button>
      </Screen>
    );
  }

  const fn = functionOf(seeking);
  const repKey = REP[fn];
  const custom = repKey ? doc.replacements[repKey as keyof Doc["replacements"]]?.trim() : "";
  const line = custom || t.replacements[fn] || t.replacements.other;

  return (
    <Screen
      footer={
        <button
          type="button"
          onClick={onDone}
          className="min-h-14 w-full rounded-card bg-accent text-base font-medium text-accent-fg"
        >
          {t.done}
        </button>
      }
    >
      <Title kicker={triggerLabel(doc, triggerId, t)}>
        {saved?.choice === "postpone"
          ? `${triggerLabel(doc, triggerId, t)} ${t.postponed}.`
          : t.saved}
      </Title>
      {saved?.choice === "close" || saved?.choice === "postpone" || saved?.choice === "dont" || saved?.choice === "draft" ? (
        <p className="mt-6 text-base text-pretty">{line}</p>
      ) : null}
    </Screen>
  );
}
