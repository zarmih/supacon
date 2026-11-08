/**
 * Trim, cut to `max` characters, and trim again. The second trim matters: a cut that lands
 * right after a space would otherwise leave trailing whitespace, and the next import would
 * trim it away, so export → import would not be stable. clip(clip(x)) === clip(x).
 */
export function clip(text: string, max: number): string {
  return text.trim().slice(0, max).trim()
}
