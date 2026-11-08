/**
 * Russian plural form selection (CLDR rules for cardinal numbers):
 * one  — 1, 21, 31, … (but not 11)
 * few  — 2–4, 22–24, … (but not 12–14)
 * many — 0, 5–20, 25–30, …
 */
export function pluralRu(n: number, one: string, few: string, many: string): string {
  const abs = Math.abs(Math.trunc(n))
  const mod10 = abs % 10
  const mod100 = abs % 100
  if (mod10 === 1 && mod100 !== 11) return one
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few
  return many
}

/** English plural form selection: 1 → one, everything else → other. */
export function pluralEn(n: number, one: string, other: string): string {
  return n === 1 ? one : other
}
