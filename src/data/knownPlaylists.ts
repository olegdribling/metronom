// Список кодов плейлистов, которые это устройство создавало/открывало —
// личный «список плейлистов» без какого-либо аккаунта (см. план, раздел
// «Совместная работа»).
const STORAGE_KEY = 'metronom_known_playlists'

export function getKnownPlaylistCodes(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as string[]) : []
  } catch {
    return []
  }
}

export function rememberPlaylistCode(code: string): void {
  const known = getKnownPlaylistCodes()
  if (known.includes(code)) return
  localStorage.setItem(STORAGE_KEY, JSON.stringify([code, ...known]))
}

export function forgetPlaylistCode(code: string): void {
  const known = getKnownPlaylistCodes().filter((c) => c !== code)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(known))
}
