export type Route =
  | { name: 'onboarding' }
  | { name: 'today' }
  | { name: 'pause'; intent: 'browse' | 'post'; triggerId?: string }
  | { name: 'session'; id: string }
  | { name: 'morning' }
  | { name: 'evening' }
  | { name: 'focus' }
  | { name: 'insights' }
  | { name: 'triggers' }
  | { name: 'protocol' }
  | { name: 'settings' }
  | { name: 'practice' }
  | { name: 'plan' }
  | { name: 'bridge' }
  | { name: 'miss' }
  | { name: 'journal' }
  | { name: 'history' }
  | { name: 'report' }

const STATIC: readonly Route['name'][] = [
  'morning',
  'evening',
  'focus',
  'insights',
  'triggers',
  'protocol',
  'settings',
  'practice',
  'plan',
  'bridge',
  'miss',
  'journal',
  'history',
  'report',
  'today',
  'onboarding',
]

function triggerFrom(pathId: string | undefined, query: URLSearchParams): string | undefined {
  const fromPath = pathId?.trim()
  if (fromPath) return fromPath
  const fromQuery = query.get('trigger')?.trim()
  return fromQuery || undefined
}

export function parseHash(hash: string): Route {
  const raw = hash.replace(/^#/, '')
  const [pathPart, queryPart] = raw.split('?')
  const path = pathPart ?? ''
  let parts: string[]
  try {
    parts = path.split('/').filter(Boolean).map((part) => decodeURIComponent(part))
  } catch {
    return { name: 'today' }
  }
  const query = new URLSearchParams(queryPart ?? '')
  const head = parts[0] ?? 'today'
  if (head === 'pause') return { name: 'pause', intent: 'browse', triggerId: triggerFrom(parts[1], query) }
  if (head === 'post') return { name: 'pause', intent: 'post', triggerId: triggerFrom(parts[1], query) }
  if (head === 'session' && parts[1]) return { name: 'session', id: parts[1] }
  if ((STATIC as readonly string[]).includes(head) && head !== 'pause' && head !== 'session') {
    return { name: head } as Route
  }
  return { name: 'today' }
}

export function routeKey(route: Route): string {
  if (route.name === 'pause') return `pause:${route.intent}:${route.triggerId ?? ''}`
  if (route.name === 'session') return `session:${route.id}`
  return route.name
}
