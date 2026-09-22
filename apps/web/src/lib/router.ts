import { useEffect, useState } from 'react'

/** Minimal hash router: `#/`, `#/maps/:id/verify`, … Works offline and under any base path. */
export type Route = { name: 'home' } | { name: 'verify'; mapId: string } | { name: 'notFound' }

export function parseHash(hash: string): Route {
  const path = hash.replace(/^#/, '') || '/'
  const verify = /^\/maps\/([a-z0-9-]+)\/verify\/?$/.exec(path)
  if (verify) return { name: 'verify', mapId: verify[1] }
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
    default:
      return '#/'
  }
}
