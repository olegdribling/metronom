import { useRef, useState, useCallback, useEffect } from 'react'
import { Song, PlaybackState } from '../types'
import { PATTERN_STEPS, instrumentFrequencyMap } from '../config'
import { useSampleLoader } from './sampleLoader'

const patternHasActiveSteps = (pattern: any) =>
  !!pattern?.tracks?.some((track: any) => track.steps.some(Boolean))

const totalBars = (song: Song) =>
  song.sections.reduce((s, sec) => s + sec.bars, 0)

export function useAudioEngine(bpm: number, currentSong: Song | null, voiceCues = false) {
  const voiceCuesRef = useRef(voiceCues)
  useEffect(() => { voiceCuesRef.current = voiceCues }, [voiceCues])

  const audioContextRef = useRef<AudioContext | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const nextNoteTimeRef = useRef(0)
  const beatRef = useRef(1)
  const barRef = useRef(0)
  const beatsPerBarRef = useRef(4)
  const visualQueueRef = useRef<any[]>([])
  const visualRafRef = useRef<number | null>(null)

  const [isPlaying, setIsPlaying] = useState(false)
  const [beatsPerBar, setBeatsPerBar] = useState(4)
  const [playbackState, setPlaybackState] = useState<PlaybackState>({ beat: 1, bar: 0, patternStep: 0, nextSectionName: null })

  const {
    sampleBufferRef,
    samplesLoaded,
    preloadAllSamples,
    prefetchAll,
  } = useSampleLoader(audioContextRef)

  useEffect(() => { beatsPerBarRef.current = beatsPerBar }, [beatsPerBar])

  // Prefetch raw sample data on mount
  useEffect(() => { prefetchAll() }, [prefetchAll])

  // Preload decoded buffers when song selected
  useEffect(() => {
    if (currentSong) preloadAllSamples()
  }, [currentSong, preloadAllSamples])

  const clickSound = useCallback((time: number, accent: boolean) => {
    const ctx = audioContextRef.current
    if (!ctx) return
    const buffer = sampleBufferRef.current[accent ? 'click_hi' : 'click_lo']
    if (buffer) {
      const source = ctx.createBufferSource()
      source.buffer = buffer
      source.connect(ctx.destination)
      source.start(time)
      return
    }
    // Fallback oscillator
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.frequency.value = accent ? 1400 : 900
    gain.gain.value = 1
    osc.start(time)
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.08)
    osc.stop(time + 0.08)
  }, [sampleBufferRef])

  const playInstrumentSound = useCallback((instrumentId: string, time: number) => {
    const ctx = audioContextRef.current
    if (!ctx) return
    const buffer = sampleBufferRef.current[instrumentId]
    if (buffer) {
      const source = ctx.createBufferSource()
      source.buffer = buffer
      source.connect(ctx.destination)
      source.start(time)
      return
    }
    // Fallback oscillator
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.type = 'triangle'
    osc.frequency.value = instrumentFrequencyMap[instrumentId] || 220
    gain.gain.value = 0.5
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.12)
    osc.start(time)
    osc.stop(time + 0.12)
  }, [sampleBufferRef])

  const schedule = useCallback(() => {
    const ctx = audioContextRef.current
    if (!ctx) return
    const ct = ctx.currentTime
    const lookahead = 0.1
    const songTotalBars = currentSong ? totalBars(currentSong) : 0
    const loopIndefinitely = currentSong ? !currentSong.sections.some(sec => !sec.intro) : false

    const sectionRanges = (() => {
      let start = 0
      return (currentSong?.sections || []).map(sec => {
        const end = start + sec.bars - 1
        const range = { start, end }
        start = end + 1
        return range
      })
    })()

    while (nextNoteTimeRef.current < ct + lookahead) {
      const scheduledTime = nextNoteTimeRef.current
      const currentBeatValue = beatRef.current
      const currentBarValue = barRef.current
      const pattern = currentSong?.pattern
      const patternLength = pattern?.steps || PATTERN_STEPS
      const totalBeatsPassed = currentBarValue * beatsPerBarRef.current + (currentBeatValue - 1)
      const usePatternSounds = pattern && patternHasActiveSteps(pattern)

      const sectionIdx = sectionRanges.findIndex(
        r => currentBarValue >= r.start && currentBarValue <= r.end
      )
      const isLastBarOfSection = sectionIdx >= 0 && currentBarValue === sectionRanges[sectionIdx].end
      const hasNextSection = sectionIdx >= 0 && sectionIdx < (currentSong?.sections.length ?? 0) - 1
      const nextSection = hasNextSection ? currentSong!.sections[sectionIdx + 1] : null
      const nextSectionName = nextSection ? nextSection.name : (sectionIdx >= 0 ? 'END' : null)

      if (voiceCuesRef.current && isLastBarOfSection) {
        if (currentBeatValue === 1) {
          playInstrumentSound(`voice_${nextSectionName}`, scheduledTime)
        } else {
          playInstrumentSound(`voice_${currentBeatValue}`, scheduledTime)
        }
      }

      if (usePatternSounds && patternLength > 0) {
        const subDiv = 2
        const subDuration = (60 / bpm) / subDiv
        const baseStep = Math.floor(totalBeatsPassed * subDiv)

        for (let sub = 0; sub < subDiv; sub++) {
          const subTime = scheduledTime + sub * subDuration
          const stepIndex = (baseStep + sub) % patternLength

          pattern.tracks.forEach(track => {
            if (track.steps[stepIndex]) {
              playInstrumentSound(track.id, subTime)
            }
          })

          visualQueueRef.current.push({
            time: subTime,
            type: 'beat',
            beat: currentBeatValue,
            bar: currentBarValue,
            patternStep: stepIndex,
            nextSectionName,
          })
        }
      } else {
        visualQueueRef.current.push({
          time: scheduledTime,
          type: 'beat',
          beat: currentBeatValue,
          bar: currentBarValue,
          patternStep: 0,
          nextSectionName,
        })
        clickSound(scheduledTime, currentBeatValue === 1)
      }

      nextNoteTimeRef.current += 60 / bpm

      if (beatRef.current === beatsPerBarRef.current) {
        beatRef.current = 1
        barRef.current += 1
        if (songTotalBars > 0 && barRef.current >= songTotalBars) {
          if (loopIndefinitely) {
            barRef.current = 0
          } else {
            visualQueueRef.current.push({ time: scheduledTime + 0.001, type: 'stop' })
            return
          }
        }
      } else {
        beatRef.current += 1
      }
    }
    timerRef.current = setTimeout(schedule, 25)
  }, [bpm, currentSong, clickSound, playInstrumentSound])

  const start = async () => {
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext()
    }
    if (audioContextRef.current.state === 'suspended') {
      await audioContextRef.current.resume()
    }
    setIsPlaying(true)
    beatRef.current = 1
    barRef.current = 0
    setPlaybackState({ beat: 1, bar: 0, patternStep: 0, nextSectionName: null })
    visualQueueRef.current = []
    nextNoteTimeRef.current = audioContextRef.current.currentTime + 0.1
    schedule()
  }

  const stop = useCallback(() => {
    setIsPlaying(false)
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null }
    if (visualRafRef.current) { cancelAnimationFrame(visualRafRef.current); visualRafRef.current = null }
    visualQueueRef.current = []
    setPlaybackState({ beat: 1, bar: 0, patternStep: 0, nextSectionName: null })
  }, [])

  // Visual RAF loop
  useEffect(() => {
    if (!isPlaying) return

    const processVisuals = () => {
      if (!audioContextRef.current) {
        visualRafRef.current = requestAnimationFrame(processVisuals)
        return
      }
      const now = audioContextRef.current.currentTime
      while (visualQueueRef.current.length && visualQueueRef.current[0].time <= now) {
        const event = visualQueueRef.current.shift()
        if (event.type === 'stop') {
          setPlaybackState({ beat: 1, bar: 0, patternStep: 0, nextSectionName: null })
          setIsPlaying(false)
          if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null }
          visualQueueRef.current = []
          if (visualRafRef.current) { cancelAnimationFrame(visualRafRef.current); visualRafRef.current = null }
          return
        }
        setPlaybackState({
          beat: event.beat,
          bar: event.bar,
          patternStep: typeof event.patternStep === 'number' ? event.patternStep : 0,
          nextSectionName: event.nextSectionName ?? null,
        })
      }
      visualRafRef.current = requestAnimationFrame(processVisuals)
    }

    visualRafRef.current = requestAnimationFrame(processVisuals)
    return () => {
      if (visualRafRef.current) { cancelAnimationFrame(visualRafRef.current); visualRafRef.current = null }
      visualQueueRef.current = []
    }
  }, [isPlaying])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stop()
      if (audioContextRef.current) {
        audioContextRef.current.close()
        audioContextRef.current = null
      }
    }
  }, [stop])

  return {
    isPlaying,
    playbackState,
    beatsPerBar,
    setBeatsPerBar,
    samplesLoaded,
    start,
    stop,
  }
}
