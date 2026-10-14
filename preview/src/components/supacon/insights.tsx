import type { Copy } from "@/lib/supacon/copy";
import { fill, pct } from "@/lib/supacon/copy";
import {
  dailyMeans,
  letter,
  round1,
  weekCompare,
  type Insight,
} from "@/lib/supacon/domain";
import { eraseExample, loadExample } from "@/lib/supacon/store";
import type { Doc } from "@/lib/supacon/types";
import { Screen, TextButton, Title } from "./ui";

function sentence(insight: Insight, t: Copy): string {
  switch (insight.kind) {
    case "threshold":
      return fill(t.insights.threshold, {
        cut: insight.cut,
        below: pct(insight.below),
        above: pct(insight.above),
      });
    case "seeking":
      return fill(t.insights.seeking, { name: t.seeking[insight.name] ?? insight.name });
    case "naming":
      return fill(t.insights.naming, {
        delta: `${insight.delta > 0 ? "+" : ""}${round1(insight.delta)}`,
      });
    case "baseline":
      return fill(t.insights.baseline, {
        early: round1(insight.early),
        late: round1(insight.late),
      });
    case "loud":
      return fill(t.insights.loud, { hour: insight.hour });
    case "posts":
      return fill(t.insights.posts, { total: insight.total, back: insight.back });
    case "highOpens":
      return t.insights.highOpens;
    case "wanting":
      return t.insights.wanting;
    case "unfinished":
      return t.insights.unfinished;
    case "function":
      return t.functions[insight.name] ?? insight.name;
    case "moved":
      return t.insights.moved;
  }
}

export function Insights({ doc, t }: { doc: Doc; t: Copy }) {
  const lines = letter(doc);
  const week = weekCompare(doc);
  const days = dailyMeans(doc);
  const hasExample = doc.pauses.some((p) => p.example);
  return (
    <Screen>
      <Title>{t.record}</Title>
      <div className="mt-8 flex h-16 items-end gap-2" aria-hidden>
        {days.map((value, index) => (
          <div key={index} className="flex h-full flex-1 items-end">
            <div
              className={`w-full rounded-sm ${value == null ? "bg-line" : "bg-fg"}`}
              style={{ height: value == null ? "2px" : `${Math.max(8, (value / 10) * 100)}%` }}
            />
          </div>
        ))}
      </div>
      {lines.length === 0 ? (
        <p className="mt-8 text-sm text-pretty text-muted">{t.letterQuiet}</p>
      ) : (
        <div className="mt-8 flex flex-col gap-5">
          {lines.map((insight, index) => (
            <p key={index} className="font-serif text-xl leading-snug text-pretty">
              {sentence(insight, t)}
            </p>
          ))}
        </div>
      )}
      {week ? (
        <div className="mt-10">
          <p className="text-sm text-muted">{t.week}</p>
          <p className="mt-2 text-base text-pretty">
            {fill(t.weekLine, {
              a: week.awareness[0],
              b: week.awareness[1],
              c: pct(week.opens[0]),
              d: pct(week.opens[1]),
            })}
          </p>
        </div>
      ) : null}
      <div className="mt-10">
        {hasExample ? (
          <TextButton onClick={() => eraseExample()}>{t.eraseExample}</TextButton>
        ) : (
          <TextButton onClick={() => loadExample()}>{t.example}</TextButton>
        )}
      </div>
    </Screen>
  );
}
