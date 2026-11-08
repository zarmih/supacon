/**
 * Focus management for a UI that re-renders with innerHTML.
 *
 * Every draw replaces the DOM, which would otherwise drop keyboard and
 * screen-reader focus onto <body> after each tap. We snapshot what had focus,
 * re-render, then put focus back on the equivalent element. On a real screen
 * change focus lands on the screen heading; a confirm dialog takes focus while
 * open and hands it back to its opener when it closes.
 */

const KEY_ATTRS = ['data-action', 'data-value', 'data-key', 'data-dir', 'href', 'name'] as const

export interface FocusSnapshot {
  selector: string
  index: number
  selection: [number, number] | null
}

function escapeValue(value: string): string {
  return typeof CSS !== 'undefined' && typeof CSS.escape === 'function' ? CSS.escape(value) : value.replace(/["\\]/g, '\\$&')
}

export function selectorFor(element: Element): string {
  if (element.id) return `#${escapeValue(element.id)}`
  const parts = [element.tagName.toLowerCase()]
  for (const attr of KEY_ATTRS) {
    const value = element.getAttribute(attr)
    if (value !== null) parts.push(`[${attr}="${escapeValue(value)}"]`)
  }
  return parts.join('')
}

export function captureFocus(root: HTMLElement): FocusSnapshot | null {
  const active = document.activeElement
  if (!(active instanceof HTMLElement) || active === root || !root.contains(active)) return null
  const selector = selectorFor(active)
  const index = Array.from(root.querySelectorAll(selector)).indexOf(active)
  let selection: [number, number] | null = null
  if ((active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) && active.selectionStart !== null) {
    try {
      selection = [active.selectionStart, active.selectionEnd ?? active.selectionStart]
    } catch {
      selection = null
    }
  }
  return { selector, index: Math.max(0, index), selection }
}

function focusable(element: Element | null | undefined): element is HTMLElement {
  if (!(element instanceof HTMLElement)) return false
  if ((element as HTMLButtonElement).disabled) return false
  if (element.closest('[hidden], [inert]')) return false
  return true
}

export function restoreFocus(root: HTMLElement, snapshot: FocusSnapshot | null): boolean {
  if (!snapshot) return false
  let matches: NodeListOf<Element>
  try {
    matches = root.querySelectorAll(snapshot.selector)
  } catch {
    return false
  }
  const target = matches[snapshot.index] ?? matches[0]
  if (!focusable(target)) return false
  target.focus({ preventScroll: true })
  if (snapshot.selection && (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) {
    try {
      target.setSelectionRange(snapshot.selection[0], snapshot.selection[1])
    } catch {
      /* some input types do not support selection */
    }
  }
  return true
}

/** Move focus to the screen's heading (or the open dialog) so assistive tech announces the new view. */
export function focusLanding(root: HTMLElement): void {
  const dialog = root.querySelector<HTMLElement>('[role="alertdialog"], [role="dialog"]')
  const target = dialog ?? root.querySelector<HTMLElement>('#step-title') ?? root.querySelector<HTMLElement>('main h1')
  if (!target) return
  if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1')
  target.focus({ preventScroll: true })
}

/** While a modal is open, everything else in the app is inert (not focusable, hidden from AT). */
export function applyModal(root: HTMLElement): boolean {
  const back = root.querySelector<HTMLElement>('.dialog-back')
  if (!back) return false
  const app = back.parentElement
  if (!app) return false
  for (const child of Array.from(app.children)) {
    if (child !== back && child instanceof HTMLElement) child.inert = true
  }
  return true
}

/**
 * Tracks focus across draws. Call `before()` just before replacing the DOM and
 * `after(screenChanged)` right after.
 */
export function createFocusKeeper(root: HTMLElement) {
  let snapshot: FocusSnapshot | null = null
  let opener: FocusSnapshot | null = null
  let modalOpen = false

  return {
    before() {
      snapshot = captureFocus(root)
    },
    after(screenChanged: boolean) {
      const modal = applyModal(root)
      if (modal && !modalOpen) {
        opener = snapshot
        modalOpen = true
        focusLanding(root)
        return
      }
      if (!modal && modalOpen) {
        modalOpen = false
        const back = opener
        opener = null
        if (!screenChanged || back) {
          if (restoreFocus(root, back)) return
        }
        focusLanding(root)
        return
      }
      if (screenChanged) {
        focusLanding(root)
        return
      }
      if (snapshot && !restoreFocus(root, snapshot)) focusLanding(root)
    },
  }
}

/** Keep Tab / Shift+Tab cycling inside an open modal. Returns true when it handled the key. */
export function trapTab(event: KeyboardEvent, root: HTMLElement): boolean {
  if (event.key !== 'Tab') return false
  const dialog = root.querySelector<HTMLElement>('[role="alertdialog"], [role="dialog"]')
  if (!dialog) return false
  const items = Array.from(dialog.querySelectorAll<HTMLElement>('button, a[href], input, textarea, select, [tabindex]:not([tabindex="-1"])')).filter(
    (el) => !(el as HTMLButtonElement).disabled,
  )
  const first = items[0]
  const last = items[items.length - 1]
  if (!first || !last) return false
  const active = document.activeElement
  const inside = active instanceof HTMLElement && dialog.contains(active)
  if (event.shiftKey && (!inside || active === first || active === dialog)) {
    event.preventDefault()
    last.focus()
    return true
  }
  if (!event.shiftKey && (!inside || active === last)) {
    event.preventDefault()
    first.focus()
    return true
  }
  return false
}
