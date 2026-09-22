import { useEffect, useState } from 'react'

/** Minimal hash router: `#/`, `#/maps/:id/verify`, … Works offline and under any base path. */
export type Route =
  | { name: 'home' }
  | { name: 'verify'; mapId: string }
  | { name: 'perf' }
  | { name: 'play' }
  | { name: 'settings' }
  | { name: 'notFound' }

export function parseHash(hash: string): Route {
  const path = hash.replace(/^#/, '') || '/'
  const verify = /^\/maps\/([a-z0-9-]+)\/verify\/?$/.exec(path)
  if (verify) return { name: 'verify', mapId: verify[1] }
  if (path === '/perf' || path === '/perf/') return { name: 'perf' }
  if (path === '/play' || path === '/play/') return { name: 'play' }
  if (path === '/settings' || path === '/settings/') return { name: 'settings' }
  if (path === '/') return { name: 'home' }
  return { name: 'notFound' }
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseHash(window.location.hash))
  useEffect(() => {
    const onChange = () => setRoute(parseHash(window.location.hash))
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return route
}

export function href(route: Route): string {
  switch (route.name) {
    case 'home':
      return '#/'
    case 'verify':
      return `#/maps/${route.mapId}/verify`
    case 'perf':
      return '#/perf'
    case 'play':
      return '#/play'
    case 'settings':
      return '#/settings'
    default:
      return '#/'
  }
}
