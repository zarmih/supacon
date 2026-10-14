import { useEffect, useState } from "react";
import { copy } from "@/lib/supacon/copy";
import { clearMessage, getDoc, getMessage, isReady, load, subscribe } from "@/lib/supacon/store";
import type { Doc, Locale, ThemeName } from "@/lib/supacon/types";
import { EveningScreen, FocusScreen, MissScreen, MorningScreen, PlanScreen, SessionScreen } from "./flows";
import { Insights } from "./insights";
import { Onboarding } from "./onboarding";
import { PauseFlow } from "./pause";
import { Settings } from "./settings";
import { Today } from "./today";

type View =
  | "today"
  | "pause"
  | "post"
  | "session"
  | "morning"
  | "evening"
  | "focus"
  | "plan"
  | "miss"
  | "insights"
  | "settings";

function deviceLocale(): Locale {
  if (typeof navigator !== "undefined" && navigator.language.toLowerCase().startsWith("ru")) {
    return "ru";
  }
  return "en";
}

function resolveTheme(doc: Doc | null): ThemeName {
  const setting = doc?.theme ?? "ink";
  if (setting === "system") {
    if (typeof window === "undefined") return "ink";
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "ink" : "paper";
  }
  return setting;
}

export function SupaconApp() {
  const [doc, setDoc] = useState<Doc | null>(null);
  const [ready, setReady] = useState(false);
  const [message, setNote] = useState<string | null>(null);
  const [draftLocale, setDraftLocale] = useState<Locale>("ru");
  const [view, setView] = useState<View>("today");

  useEffect(() => {
    load();
    const pull = () => {
      setDoc(getDoc());
      setReady(isReady());
      setNote(getMessage());
    };
    pull();
    setDraftLocale(deviceLocale());
    return subscribe(pull);
  }, []);

  const locale: Locale = doc ? (doc.locale === "ru" ? "ru" : doc.locale === "en" ? "en" : deviceLocale()) : draftLocale;
  const t = copy[locale];
  const theme = resolveTheme(doc);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.lang = locale;
  }, [theme, locale]);

  if (!ready || !doc) {
    return (
      <main className="min-h-dvh bg-bg text-fg">
        {!ready ? (
          <div className="mx-auto max-w-md px-5 pt-16">
            <h1 className="font-serif text-5xl">Supacon</h1>
            <p className="mt-4 text-lg text-pretty text-muted">{copy.ru.tagline}</p>
          </div>
        ) : (
          <Onboarding locale={draftLocale} onLocale={setDraftLocale} t={t} />
        )}
      </main>
    );
  }

  const showNav = view === "today" || view === "insights" || view === "settings";

  return (
    <main className="flex h-dvh flex-col bg-bg text-fg">
      {message ? (
        <button
          type="button"
          onClick={() => clearMessage()}
          className="w-full bg-quiet px-5 py-3 text-left text-sm"
        >
          {message}
        </button>
      ) : null}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {view === "today" ? <Today doc={doc} t={t} onGo={(dest) => setView(dest === "pause" ? "pause" : dest)} /> : null}
        {view === "pause" ? (
          <PauseFlow doc={doc} t={t} kind="browse" onDone={() => setView("today")} onSession={() => setView("session")} />
        ) : null}
        {view === "post" ? (
          <PauseFlow doc={doc} t={t} kind="post" onDone={() => setView("today")} onSession={() => setView("today")} />
        ) : null}
        {view === "session" ? <SessionScreen doc={doc} t={t} onDone={() => setView("today")} /> : null}
        {view === "morning" ? <MorningScreen doc={doc} t={t} onDone={() => setView("today")} /> : null}
        {view === "evening" ? <EveningScreen doc={doc} t={t} onDone={() => setView("today")} /> : null}
        {view === "focus" ? <FocusScreen doc={doc} t={t} onDone={() => setView("today")} /> : null}
        {view === "plan" ? <PlanScreen doc={doc} t={t} onDone={() => setView("today")} /> : null}
        {view === "miss" ? <MissScreen t={t} onDone={() => setView("today")} /> : null}
        {view === "insights" ? <Insights doc={doc} t={t} /> : null}
        {view === "settings" ? <Settings doc={doc} t={t} /> : null}
      </div>
      {showNav ? (
        <nav className="shrink-0 border-t border-line bg-bg">
          <div className="mx-auto grid max-w-md grid-cols-4">
            {(
              [
                ["today", t.today],
                ["pause", t.pause],
                ["insights", t.record],
                ["settings", t.settings],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setView(id)}
                className={`min-h-14 text-sm ${view === id ? "text-fg" : "text-muted"}`}
              >
                {label}
              </button>
            ))}
          </div>
        </nav>
      ) : null}
    </main>
  );
}
