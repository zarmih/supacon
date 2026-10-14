import { useState } from "react";
import type { Copy } from "@/lib/supacon/copy";
import { begin } from "@/lib/supacon/store";
import { PRESET_IDS, type Locale } from "@/lib/supacon/types";
import { AccentButton, QuietButton, Screen } from "./ui";

export function Onboarding({
  locale,
  onLocale,
  t,
}: {
  locale: Locale;
  onLocale: (locale: Locale) => void;
  t: Copy;
}) {
  const [selected, setSelected] = useState<string[]>(["other"]);
  const [custom, setCustom] = useState("");
  const [names, setNames] = useState<string[]>([]);

  function toggle(id: string) {
    setSelected((current) => {
      const has = current.includes(id);
      if (has && current.length + names.length <= 1) return current;
      return has ? current.filter((item) => item !== id) : [...current, id];
    });
  }

  function addCustom() {
    const name = custom.trim();
    if (!name) return;
    setNames((current) => [...current, name]);
    setCustom("");
  }

  return (
    <Screen>
      <div className="flex items-center justify-between">
        <p className="font-serif text-lg">Supacon</p>
        <div className="flex gap-2 text-sm">
          <button
            type="button"
            onClick={() => onLocale("en")}
            className={`min-h-11 px-2 ${locale === "en" ? "text-fg" : "text-muted"}`}
          >
            EN
          </button>
          <button
            type="button"
            onClick={() => onLocale("ru")}
            className={`min-h-11 px-2 ${locale === "ru" ? "text-fg" : "text-muted"}`}
          >
            RU
          </button>
        </div>
      </div>
      <h1 className="mt-8 font-serif text-4xl leading-tight text-balance">{t.tagline}</h1>
      <p className="mt-10 text-sm text-muted">{t.pulls}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {PRESET_IDS.map((id) => {
          const on = selected.includes(id);
          return (
            <button
              key={id}
              type="button"
              onClick={() => toggle(id)}
              className={`min-h-11 rounded-full px-4 text-sm ${on ? "bg-accent text-accent-fg" : "bg-quiet text-fg"}`}
            >
              {t.presets[id]}
            </button>
          );
        })}
        {names.map((name) => (
          <span key={name} className="inline-flex min-h-11 items-center rounded-full bg-accent px-4 text-sm text-accent-fg">
            {name}
          </span>
        ))}
      </div>
      <div className="mt-4 flex gap-2">
        <input
          value={custom}
          onChange={(event) => setCustom(event.target.value)}
          placeholder={t.addName}
          className="min-h-11 flex-1 rounded-card border border-line bg-surface px-4 text-fg outline-none"
        />
        <button type="button" onClick={addCustom} className="min-h-11 rounded-card bg-quiet px-4 text-sm">
          {t.add}
        </button>
      </div>
      <p className="mt-3 text-sm text-muted">{t.needOne}</p>
      <div className="mt-10 flex flex-col gap-3">
        <AccentButton onClick={() => begin({ selected, custom: names, skip: false, locale })}>
          {t.begin}
        </AccentButton>
        <QuietButton onClick={() => begin({ selected, custom: names, skip: true, locale })}>
          {t.skip}
        </QuietButton>
      </div>
    </Screen>
  );
}
