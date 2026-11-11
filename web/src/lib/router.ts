import { useSyncExternalStore } from 'react'

// GitHub Pages で 404 にならないよう、ハッシュで画面を切り替える
export type Route =
  | { name: 'list' }
  | { name: 'task'; id: string }
  | { name: 'routineDay'; routineId: string; date: string }
  | { name: 'routines' }
  | { name: 'routineEdit'; id: string | null }
  | { name: 'settings' }

export function parseRoute(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent)
  const [a, b, c] = parts
  if (a === 'task' && b) return { name: 'task', id: b }
  if (a === 'routine-day' && b && c) return { name: 'routineDay', routineId: b, date: c }
  if (a === 'routines' && b === 'new') return { name: 'routineEdit', id: null }
  if (a === 'routines' && b) return { name: 'routineEdit', id: b }
  if (a === 'routines') return { name: 'routines' }
  if (a === 'settings') return { name: 'settings' }
  return { name: 'list' }
}

export function href(route: Route): string {
  switch (route.name) {
    case 'list':
      return '#/'
    case 'task':
      return `#/task/${encodeURIComponent(route.id)}`
    case 'routineDay':
      return `#/routine-day/${encodeURIComponent(route.routineId)}/${route.date}`
    case 'routines':
      return '#/routines'
    case 'routineEdit':
      return route.id ? `#/routines/${encodeURIComponent(route.id)}` : '#/routines/new'
    case 'settings':
      return '#/settings'
  }
}

// アプリ内で積んだ履歴の数（直接URLで開いた画面からの「戻る」は一覧へ）
let inAppDepth = 0
window.addEventListener('popstate', () => {
  if (inAppDepth > 0) inAppDepth -= 1
})

export function navigate(route: Route, opts: { replace?: boolean } = {}) {
  const h = href(route)
  if (opts.replace) {
    history.replaceState(null, '', h)
    window.dispatchEvent(new HashChangeEvent('hashchange'))
  } else {
    inAppDepth += 1
    location.hash = h
  }
}

/** アプリ内から来た場合は履歴で戻る（一覧のスクロール位置を保つ）。直接開いた場合は fallback へ */
export function goBack(fallback: Route = { name: 'list' }) {
  if (inAppDepth > 0) {
    history.back()
    return
  }
  navigate(fallback, { replace: true })
}

function subscribe(cb: () => void) {
  window.addEventListener('hashchange', cb)
  return () => window.removeEventListener('hashchange', cb)
}

export function useHash(): string {
  return useSyncExternalStore(subscribe, () => location.hash, () => '')
}

/** 画面下のタブを出す画面 */
export type TabName = 'list' | 'routines' | 'settings'

export function isTabRoute(route: Route): route is Extract<Route, { name: TabName }> {
  return route.name === 'list' || route.name === 'routines' || route.name === 'settings'
}
