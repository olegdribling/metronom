// Самописный роутер — без React, значит и без React Router. История
// браузера (pushState), путь → обработчик. Экраны: метроном / плейлист /
// песня / паттерн песни и биты (редактор бита) / настройки.
export type RouteHandler = (params: Record<string, string>) => void

interface Route {
  pattern: RegExp
  keys: string[]
  handler: RouteHandler
}

export interface Router {
  on(path: string, handler: RouteHandler): void
  notFoundHandler(handler: RouteHandler): void
  navigate(path: string): void
  resolve(): void
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

  function on(path: string, handler: RouteHandler) {
    const { pattern, keys } = compile(path)
    routes.push({ pattern, keys, handler })
  }

  function resolve() {
    const path = location.pathname
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

  function navigate(path: string) {
    if (location.pathname === path) {
      resolve()
      return
    }
    history.pushState({}, '', path)
    resolve()
  }

  window.addEventListener('popstate', resolve)

  return { on, notFoundHandler: (handler) => (notFound = handler), navigate, resolve }
}
