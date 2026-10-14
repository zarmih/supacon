import { useState, type ReactNode } from "react";
import type { Copy } from "@/lib/supacon/copy";
import {
  addTrigger,
  eraseAll,
  exportDoc,
  importDoc,
  restartProtocol,
  setBreath,
  setLocale,
  setMessage,
  setTheme,
  toggleTrigger,
} from "@/lib/supacon/store";
import type { Doc, Locale } from "@/lib/supacon/types";
import { QuietButton, Screen, Title, triggerLabel } from "./ui";

export function Settings({ doc, t }: { doc: Doc; t: Copy }) {
  const [name, setName] = useState("");
  const [confirm, setConfirm] = useState(false);
  const locale: Locale = doc.locale === "ru" ? "ru" : "en";

  return (
    <Screen>
      <Title>{t.settings}</Title>
      <p className="mt-4 text-sm text-pretty text-muted">{t.cannot}</p>

      <p className="mt-10 text-sm text-muted">{t.language}</p>
      <div className="mt-2 flex gap-2">
        <Choice on={locale === "en"} onClick={() => setLocale("en")}>{t.english}</Choice>
        <Choice on={locale === "ru"} onClick={() => setLocale("ru")}>{t.russian}</Choice>
      </div>

      <p className="mt-8 text-sm text-muted">{t.theme}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {(["ink", "paper", "system"] as const).map((theme) => (
          <Choice key={theme} on={doc.theme === theme} onClick={() => setTheme(theme)}>
            {theme === "ink" ? t.ink : theme === "paper" ? t.paper : t.system}
          </Choice>
        ))}
      </div>

      <p className="mt-8 text-sm text-muted">{t.breath}</p>
      <div className="mt-2 flex gap-2">
        {([5, 10, 15] as const).map((seconds) => (
          <Choice
            key={seconds}
            on={doc.breathSeconds === seconds}
            onClick={() => setBreath(seconds)}
          >
            {seconds}
            {t.seconds}
          </Choice>
        ))}
      </div>

      <p className="mt-8 text-sm text-muted">{t.triggers}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {doc.triggers.map((trigger) => (
          <Choice
            key={trigger.id}
            on={trigger.enabled}
            onClick={() => toggleTrigger(trigger.id)}
          >
            {triggerLabel(doc, trigger.id, t)}
          </Choice>
        ))}
      </div>
      <div className="mt-3 flex gap-2">
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={t.addName}
          className="min-h-11 flex-1 rounded-card border border-line bg-surface px-4 outline-none"
        />
        <button
          type="button"
          className="min-h-11 rounded-card bg-quiet px-4 text-sm"
          onClick={() => {
            addTrigger(name);
            setName("");
          }}
        >
          {t.add}
        </button>
      </div>

      <div className="mt-10 flex flex-col gap-2">
        <QuietButton onClick={() => exportDoc()}>{t.export}</QuietButton>
        <label className="flex min-h-11 cursor-pointer items-center justify-center rounded-card bg-quiet text-sm font-medium">
          {t.import}
          <input
            type="file"
            accept="application/json"
            className="sr-only"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              const ok = importDoc(await file.text());
              if (!ok) setMessage(t.badFile);
              event.target.value = "";
            }}
          />
        </label>
        <QuietButton onClick={() => restartProtocol()}>{t.restart}</QuietButton>
        {confirm ? (
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => eraseAll()}
              className="min-h-11 rounded-card bg-fg text-sm font-medium text-bg"
            >
              {t.eraseConfirm}
            </button>
            <QuietButton onClick={() => setConfirm(false)}>{t.cancel}</QuietButton>
          </div>
        ) : (
          <QuietButton onClick={() => setConfirm(true)}>{t.erase}</QuietButton>
        )}
      </div>
    </Screen>
  );
}

function Choice({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-h-11 rounded-full px-4 text-sm ${on ? "bg-accent text-accent-fg" : "bg-quiet text-fg"}`}
    >
      {children}
    </button>
  );
}
