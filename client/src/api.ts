import type { User, Song } from './types'

const BASE_URL = '/api'

const getToken = () => localStorage.getItem('tt_token') || ''
const getRefreshToken = () => localStorage.getItem('tt_refresh_token') || ''

const setTokens = (token: string, refreshToken: string) => {
  localStorage.setItem('tt_token', token)
  localStorage.setItem('tt_refresh_token', refreshToken)
}

const clearTokens = () => {
  localStorage.removeItem('tt_token')
  localStorage.removeItem('tt_refresh_token')
  localStorage.removeItem('tt_auth')
}

let refreshPromise: Promise<string | null> | null = null

async function doRefresh(): Promise<string | null> {
  const refreshToken = getRefreshToken()
  if (!refreshToken) {
    clearTokens()
    window.location.href = '/login'
    return null
  }
  try {
    const res = await fetch(`${BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    })
    if (!res.ok) {
      clearTokens()
      window.location.href = '/login'
      return null
    }
    const data = await res.json()
    setTokens(data.token, data.refreshToken)
    return data.token
  } catch {
    clearTokens()
    window.location.href = '/login'
    return null
  }
}

async function fetchAuth(url: string, options: RequestInit = {}): Promise<Response> {
  const makeHeaders = (token: string): HeadersInit => ({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  })

  let res = await fetch(url, { ...options, headers: makeHeaders(getToken()) })
  if (res.status !== 401) return res

  if (!refreshPromise) {
    refreshPromise = doRefresh().finally(() => { refreshPromise = null })
  }
  const newToken = await refreshPromise
  if (!newToken) return res

  return fetch(url, { ...options, headers: makeHeaders(newToken) })
}

export const api = {
  // ── Auth ──
  async register(email: string, password: string) {
    const res = await fetch(`${BASE_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
    return res.json()
  },

  async login(email: string, password: string) {
    const res = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
    return res.json()
  },

  async forgotPassword(email: string) {
    const res = await fetch(`${BASE_URL}/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    })
    return res.json()
  },

  async resetPassword(token: string, password: string) {
    const res = await fetch(`${BASE_URL}/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, password }),
    })
    return res.json()
  },

  async me(): Promise<User> {
    const res = await fetchAuth(`${BASE_URL}/auth/me`)
    return res.json()
  },

  async logout() {
    const refreshToken = getRefreshToken()
    clearTokens()
    await fetch(`${BASE_URL}/auth/logout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    }).catch(() => {})
  },

  // ── Songs ──
  async getSongs(): Promise<Song[]> {
    const res = await fetchAuth(`${BASE_URL}/songs`)
    if (!res.ok) return []
    return res.json()
  },

  async saveSongs(songs: Song[]): Promise<void> {
    await fetchAuth(`${BASE_URL}/songs`, {
      method: 'PUT',
      body: JSON.stringify(songs),
    })
  },
}
