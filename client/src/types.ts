export type User = { id: number; email: string }

export type ThemeKey = 'purple' | 'gray' | 'light'

export interface PatternTrack {
  id: string
  name: string
  color: string
  sample: string
  steps: boolean[]
}

export interface Pattern {
  steps: number
  tracks: PatternTrack[]
}

export interface Section {
  name: string
  bars: number
  comment: string
  intro: boolean
}

export interface Song {
  id: number
  name: string
  bpm: number
  sections: Section[]
  pattern: Pattern
}

export interface PlaybackState {
  beat: number
  bar: number
  patternStep: number
}

export interface SectionRange {
  start: number
  end: number
}

export interface SectionFormData {
  name: string
  bars: number
  comment: string
}
