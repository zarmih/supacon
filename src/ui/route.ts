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
  | { name: 'miss' }

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
  'miss',
  'today',
  'onboarding',
]

export function parseHash(hash: string): Route {
  const path = hash.replace(/^#/, '').split('?')[0] ?? ''
  const parts = path.split('/').filter(Boolean).map((part) => decodeURIComponent(part))
  const head = parts[0] ?? 'today'
  if (head === 'pause') return { name: 'pause', intent: 'browse', triggerId: parts[1] }
  if (head === 'post') return { name: 'pause', intent: 'post', triggerId: parts[1] }
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
