import { useEffect, useState, type ReactNode } from "react";
import type { Copy } from "@/lib/supacon/copy";
import type { Doc } from "@/lib/supacon/types";

export function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [active]);
  return now;
}

export function mmss(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function triggerLabel(doc: Doc, id: string, t: Copy): string {
  const trigger = doc.triggers.find((item) => item.id === id);
  if (!trigger) return id;
  if (!trigger.preset) return trigger.name;
  return t.presets[trigger.id] ?? trigger.name;
}

export function Screen({
  children,
  footer,
}: {
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="flex min-h-full flex-col">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-5 pt-8 pb-8">
        {children}
      </div>
      {footer ? (
        <div className="border-t border-line bg-bg">
          <div className="mx-auto w-full max-w-md px-5 py-4">{footer}</div>
        </div>
      ) : null}
    </div>
  );
}

export function Title({ kicker, children }: { kicker?: string; children: ReactNode }) {
  return (
    <header>
      {kicker ? <p className="text-sm text-muted">{kicker}</p> : null}
      <h1 className="mt-2 font-serif text-4xl leading-tight text-balance">{children}</h1>
    </header>
  );
}

export function QuietButton({
  children,
  onClick,
  disabled,
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className="min-h-11 w-full rounded-card bg-quiet px-4 text-sm font-medium text-fg transition-opacity disabled:opacity-40"
    >
      {children}
    </button>
  );
}

export function AccentButton({
  children,
  onClick,
  disabled,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="min-h-14 w-full rounded-card bg-accent px-4 text-base font-medium text-accent-fg transition-opacity disabled:opacity-40"
    >
      {children}
    </button>
  );
}

export function TextButton({
  children,
  onClick,
}: {
  children: ReactNode;
  onClick?: () => void;
}) {
  return (
    <button type="button" onClick={onClick} className="min-h-11 text-sm text-muted">
      {children}
    </button>
  );
}

export function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="text-sm text-muted">{label}</span>
      <input
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 min-h-11 w-full rounded-card border border-line bg-surface px-4 text-fg outline-none"
      />
    </label>
  );
}

export function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-4">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="text-right font-medium tabular-nums">{value}</dd>
    </div>
  );
}

export function Back({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="mb-6 min-h-11 text-sm text-muted">
      {label}
    </button>
  );
}
