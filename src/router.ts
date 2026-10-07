// Самописный роутер — без React, значит и без React Router. История
// браузера (pushState), путь → обработчик. Экраны: метроном / плейлист /
// песня / паттерн песни и биты (редактор бита) / настройки.
export type RouteHandler = (params: Record<string, string>) => void

interface Route {
  pattern: RegExp
  keys: string[]
  handler: RouteHandler
}

/** Перед уходом со страницы: true — переход задержан (proceed() выполнит
 * его позже, или его не будет). Несохранённые правки — app.ts. */
export type RouteGuard = (proceed: () => void) => boolean

export interface Router {
  on(path: string, handler: RouteHandler): void
  notFoundHandler(handler: RouteHandler): void
  navigate(path: string): void
  resolve(): void
  setGuard(guard: RouteGuard): void
}

function compile(path: string): { pattern: RegExp; keys: string[] } {
  const keys: string[] = []
  const pattern = path
    .split('/')
    .map((segment) => {
      if (segment.startsWith(':')) {
        keys.push(segment.slice(1))
        return '([^/]+)'
      }
      return segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    })
    .join('/')
  return { pattern: new RegExp(`^${pattern}$`), keys }
}

export function createRouter(): Router {
  const routes: Route[] = []
  let notFound: RouteHandler = () => {}
  let guard: RouteGuard | null = null
  // Путь открытой страницы и номер её записи в истории — чтобы вернуться
  // на неё, если «назад»/«вперёд» браузера задержали.
  let current = location.pathname
  let index = 0
  history.replaceState({ index }, '')

  function on(path: string, handler: RouteHandler) {
    const { pattern, keys } = compile(path)
    routes.push({ pattern, keys, handler })
  }

  function resolve() {
    const path = location.pathname
    current = path
    for (const route of routes) {
      const match = route.pattern.exec(path)
      if (match) {
        const params: Record<string, string> = {}
        try {
          route.keys.forEach((key, i) => {
            params[key] = decodeURIComponent(match[i + 1])
          })
        } catch {
          break // битый %-код в адресе (/beats/%E0%A4) — как неизвестный путь
        }
        route.handler(params)
        return
      }
    }
    notFound({})
  }

  function go(path: string) {
    if (location.pathname !== path) history.pushState({ index: ++index }, '', path)
    resolve()
  }

  function navigate(path: string) {
    if (guard?.(() => go(path))) return
    go(path)
  }

  // «Назад»/«вперёд» браузера: адрес уже сменился. Переход задержан —
  // история возвращается на запись страницы (её popstate — тот же путь,
  // ничего не делает), согласились уйти — снова туда, куда шли.
  window.addEventListener('popstate', (e) => {
    const path = location.pathname
    const from = index
    const to = typeof e.state?.index === 'number' ? e.state.index : 0
    index = to
    if (path === current) return
    // Запись без номера (из истории до перезагрузки) — go(0) перезагрузил
    // бы страницу: тогда страница встаёт новой записью.
    const back = () => (to !== from ? history.go(from - to) : history.pushState({ index: ++index }, '', current))
    const proceed = () => (to !== from ? history.go(to - from) : (history.replaceState({ index }, '', path), resolve()))
    if (guard?.(proceed)) back()
    else resolve()
  })

  return { on, notFoundHandler: (handler) => (notFound = handler), navigate, resolve, setGuard: (g) => (guard = g) }
}
