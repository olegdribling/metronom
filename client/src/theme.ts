import { ThemeKey } from './types'

export interface Theme {
  _name: string
  page: string
  card: string
  cardActive: string
  btn: string
  btnAccent: string
  btnDanger: string
  btnDisabled: string
  input: string
  text: string
  textSub: string
  textMuted: string
  textAccent: string
  textDanger: string
  border: string
  borderStrong: string
  borderAccent: string
  borderDanger: string
  beat: string
  beatActive: string
  beatAccent: string
  stepOff: string
  stepCurrent: string
  beatGridCurrent: string
  beatGridFilled: string
  beatGridBar: string
  beatGridEmpty: string
  navActive: string
  navInactive: string
  navBg: string
  playBtn: string
  stopBtn: string
  sliderAccent: string
  instruments: { bd: string; sd: string; hh: string }
  preview: string[]
}

export const THEMES: Record<ThemeKey, Theme> = {
  purple: {
    _name: 'Purple',
    page:        'bg-slate-950 text-white',
    card:        'bg-slate-900 border border-slate-800 rounded-2xl',
    cardActive:  'bg-violet-950/50 border border-violet-400 ring-1 ring-violet-500/50 rounded-2xl',
    btn:         'bg-slate-800 hover:bg-slate-700 border border-slate-700 transition',
    btnAccent:   'bg-violet-600 hover:bg-violet-500 transition',
    btnDanger:   'bg-rose-600 hover:bg-rose-500 transition',
    btnDisabled: 'bg-slate-800 border border-slate-700 opacity-40 cursor-not-allowed',
    input:       'bg-slate-800 border border-slate-700 text-white placeholder-slate-500 focus:border-violet-500 focus:outline-none',
    text:        'text-white',
    textSub:     'text-slate-400',
    textMuted:   'text-slate-600',
    textAccent:  'text-violet-400',
    textDanger:  'text-rose-400',
    border:       'border-slate-800',
    borderStrong: 'border-slate-700',
    borderAccent: 'border-violet-400',
    borderDanger: 'border-rose-800',
    beat:        'bg-slate-800 text-slate-600',
    beatActive:  'bg-violet-600 ring-1 ring-violet-400 scale-105 text-white',
    beatAccent:  'bg-violet-400 ring-2 ring-violet-300 scale-110 text-white',
    stepOff:     'bg-slate-800 border border-slate-700',
    stepCurrent: 'ring-2 ring-violet-400',
    beatGridCurrent: 'bg-violet-400 ring-1 ring-violet-300',
    beatGridFilled:  'bg-violet-700/70',
    beatGridBar:     'bg-slate-600 border border-slate-500',
    beatGridEmpty:   'bg-slate-800',
    navActive:   'text-violet-400',
    navInactive: 'text-slate-500 hover:text-slate-300',
    navBg:       'bg-slate-950 border-t border-slate-800',
    playBtn:      'bg-violet-600 hover:bg-violet-500 shadow-lg shadow-violet-900/50',
    stopBtn:      'bg-rose-600 hover:bg-rose-500 shadow-lg shadow-rose-900/50',
    sliderAccent: 'accent-violet-500',
    instruments: { bd: '#f97316', sd: '#eab308', hh: '#3b82f6' },
    preview: ['bg-slate-950', 'bg-violet-600', 'bg-rose-600', 'bg-slate-800'],
  },

  light: {
    _name: 'Light',
    page:        'bg-stone-100 text-gray-900',
    card:        'bg-white border border-gray-300 rounded-2xl shadow-sm',
    cardActive:  'bg-white border-2 border-gray-800 ring-1 ring-gray-800/15 rounded-2xl shadow-sm',
    btn:         'bg-white hover:bg-stone-50 border border-gray-300 transition text-gray-900 font-medium shadow-sm',
    btnAccent:   'bg-gray-900 hover:bg-gray-800 border border-gray-900 transition text-white font-medium shadow-sm',
    btnDanger:   'bg-white hover:bg-red-50 border border-red-300 transition text-red-700 font-medium shadow-sm',
    btnDisabled: 'bg-stone-100 border border-gray-300 opacity-50 cursor-not-allowed text-gray-500',
    input:       'bg-white border border-gray-300 text-gray-900 placeholder-gray-400 focus:border-gray-600 focus:outline-none shadow-sm',
    text:        'text-gray-900',
    textSub:     'text-gray-600',
    textMuted:   'text-gray-400',
    textAccent:  'text-gray-900',
    textDanger:  'text-red-600',
    border:       'border-gray-300',
    borderStrong: 'border-gray-400',
    borderAccent: 'border-gray-800',
    borderDanger: 'border-red-300',
    beat:        'bg-white border border-gray-300 text-gray-500 font-semibold shadow-sm',
    beatActive:  'bg-stone-200 border border-gray-500 ring-1 ring-gray-400 scale-105 text-gray-900 font-bold',
    beatAccent:  'bg-gray-900 ring-2 ring-gray-700 scale-110 text-white font-bold',
    stepOff:     'bg-white border border-gray-300 shadow-sm',
    stepCurrent: 'ring-2 ring-gray-800',
    beatGridCurrent: 'bg-gray-900',
    beatGridFilled:  'bg-gray-400 border border-gray-400',
    beatGridBar:     'bg-stone-100 border border-gray-300',
    beatGridEmpty:   'bg-white border border-gray-300',
    navActive:   'text-gray-900 font-semibold',
    navInactive: 'text-gray-500 hover:text-gray-700',
    navBg:       'bg-white border-t border-gray-300',
    playBtn:      'bg-gray-900 hover:bg-gray-800 border border-gray-900 shadow-md text-white',
    stopBtn:      'bg-white hover:bg-red-50 border border-red-400 shadow-md text-red-700',
    sliderAccent: 'accent-gray-900',
    instruments: { bd: '#c2410c', sd: '#a16207', hh: '#2563eb' },
    preview: ['bg-stone-100', 'bg-white', 'bg-gray-900', 'bg-gray-300'],
  },

  gray: {
    _name: 'Minimal',
    page:        'bg-white text-gray-900',
    card:        'bg-gray-50 border border-gray-300 rounded-2xl',
    cardActive:  'bg-white border-2 border-gray-700 ring-1 ring-gray-700/10 rounded-2xl',
    btn:         'bg-white hover:bg-gray-50 border border-gray-300 transition text-gray-900',
    btnAccent:   'bg-gray-800 hover:bg-gray-700 border border-gray-800 text-white transition',
    btnDanger:   'bg-white hover:bg-red-50 border border-red-300 text-red-600 transition',
    btnDisabled: 'bg-gray-50 border border-gray-300 opacity-50 cursor-not-allowed text-gray-400',
    input:       'bg-white border border-gray-300 text-gray-900 placeholder-gray-400 focus:border-gray-600 focus:outline-none',
    text:        'text-gray-900',
    textSub:     'text-gray-600',
    textMuted:   'text-gray-400',
    textAccent:  'text-gray-800',
    textDanger:  'text-red-600',
    border:       'border-gray-300',
    borderStrong: 'border-gray-400',
    borderAccent: 'border-gray-700',
    borderDanger: 'border-red-300',
    beat:        'bg-gray-50 border border-gray-300 text-gray-600',
    beatActive:  'bg-gray-300 border border-gray-500 ring-1 ring-gray-400 scale-105 text-gray-900',
    beatAccent:  'bg-gray-800 ring-2 ring-gray-600 scale-110 text-white',
    stepOff:     'bg-gray-50 border border-gray-300',
    stepCurrent: 'ring-2 ring-gray-700',
    beatGridCurrent: 'bg-gray-800',
    beatGridFilled:  'bg-gray-400 border border-gray-400',
    beatGridBar:     'bg-gray-100 border border-gray-300',
    beatGridEmpty:   'bg-gray-50 border border-gray-300',
    navActive:   'text-gray-900 font-medium',
    navInactive: 'text-gray-400 hover:text-gray-600',
    navBg:       'bg-white border-t border-gray-300',
    playBtn:      'bg-gray-800 hover:bg-gray-700 border border-gray-800 text-white shadow-md',
    stopBtn:      'bg-white hover:bg-red-50 border border-red-400 text-red-600 shadow-md',
    sliderAccent: 'accent-gray-800',
    instruments: { bd: '#374151', sd: '#6b7280', hh: '#9ca3af' },
    preview: ['bg-white', 'bg-gray-50', 'bg-gray-800', 'bg-gray-300'],
  },
}
