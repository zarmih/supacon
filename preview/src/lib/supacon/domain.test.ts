import assert from "node:assert/strict";
import test from "node:test";
import {
  capOn,
  chooseHint,
  letter,
  protocolDay,
  threshold,
} from "./domain.ts";
import type { Doc, Pause } from "./types.ts";

test("protocol day does not rewind and absence still advances", () => {
  assert.equal(protocolDay("2026-10-01", "2026-10-01"), 1);
  assert.equal(protocolDay("2026-10-01", "2026-10-03"), 3);
  assert.equal(protocolDay("2026-10-01", "2026-09-30"), 1);
  assert.equal(protocolDay(null, "2026-10-03"), null);
});

test("cap stays off for calibration and open practice", () => {
  assert.equal(capOn(1, null), false);
  assert.equal(capOn(2, null), false);
  assert.equal(capOn(3, null), true);
  assert.equal(capOn(9, null), true);
  assert.equal(capOn(9, "open"), false);
  assert.equal(capOn(9, "maintenance"), true);
  assert.equal(capOn(null, "open"), false);
});

function pause(partial: Partial<Pause> & Pick<Pause, "score" | "choice">): Pause {
  return {
    id: partial.id ?? Math.random().toString(36).slice(2),
    at: partial.at ?? Date.parse("2026-10-10T12:00:00"),
    triggerId: partial.triggerId ?? "instagram",
    kind: partial.kind ?? "browse",
    seeking: partial.seeking ?? "habit",
    score: partial.score,
    choice: partial.choice,
    breathMs: partial.breathMs ?? 10_000,
    overLimit: partial.overLimit ?? false,
    secondScore: partial.secondScore,
    example: partial.example,
    missed: partial.missed,
  };
}

test("threshold needs four on each side and keeps the wider gap", () => {
  const pauses = [
    pause({ score: 2, choice: "open" }),
    pause({ score: 3, choice: "open" }),
    pause({ score: 3, choice: "open" }),
    pause({ score: 4, choice: "open" }),
    pause({ score: 8, choice: "close" }),
    pause({ score: 8, choice: "postpone" }),
    pause({ score: 9, choice: "close" }),
    pause({ score: 9, choice: "postpone" }),
  ];
  const cut = threshold(pauses);
  assert.ok(cut);
  assert.equal(cut.cut, 8);
  assert.equal(cut.below, 1);
  assert.equal(cut.above, 0);
});

test("a thin record only hints when the cap is already past", () => {
  const doc = {
    protocolStart: "2026-10-01",
    mode: null,
    sessionCap: 3,
    pauses: [pause({ score: 8, choice: "open" })],
    sessions: [],
  } as unknown as Doc;
  assert.equal(chooseHint(doc, 9, "habit", Date.parse("2026-10-01T12:00:00")), null);
  assert.equal(letter({ ...doc, pauses: doc.pauses }).length, 0);
});
