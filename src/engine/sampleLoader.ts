// Загрузка и декодирование сэмплов. Перенесено из v1 (engine/sampleLoader.ts)
// почти без изменений — сам алгоритм (fetch → decodeAudioData, с кэшем и
// дедупликацией параллельных запросов по одному id) не зависел от React,
// только обёртка была хуком. useRef заменён на обычный { current } —
// это и есть всё, чем был ref во время выполнения, React не добавлял сюда
// ничего своего.
import { ALL_INSTRUMENTS, instrumentMetaById } from '../config.ts'

export interface SampleLoader {
  setAudioContext(ctx: AudioContext): void
  getBuffer(instrumentId: string): AudioBuffer | undefined
  ensureSampleBuffer(instrumentId: string): Promise<AudioBuffer | null>
  preloadAllSamples(): Promise<void>
  prefetchAll(): void
  readonly samplesLoaded: boolean
  onSamplesLoadedChange(cb: (loaded: boolean) => void): void
}

export function createSampleLoader(): SampleLoader {
  const audioContextRef = { current: null as AudioContext | null }
  const sampleData: Record<string, ArrayBuffer> = {}
  const sampleBuffers: Record<string, AudioBuffer> = {}
  const fetchPromises: Record<string, Promise<ArrayBuffer | null>> = {}
  const decodePromises: Record<string, Promise<AudioBuffer | null>> = {}
  let samplesLoaded = false
  let listener: ((loaded: boolean) => void) | null = null

  const setSamplesLoaded = (v: boolean) => {
    samplesLoaded = v
    listener?.(v)
  }

  function fetchSampleData(instrumentId: string): Promise<ArrayBuffer | null> {
    if (sampleData[instrumentId]) return Promise.resolve(sampleData[instrumentId])
    if (fetchPromises[instrumentId] != null) return fetchPromises[instrumentId]

    const samplePath = instrumentMetaById[instrumentId]?.sample
    if (!samplePath) return Promise.resolve(null)

    const promise = fetch(`/${samplePath}`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.arrayBuffer()
      })
      .then((data) => {
        sampleData[instrumentId] = data
        return data
      })
      .catch((err) => {
        console.warn(`Не удалось загрузить сэмпл "${instrumentId}":`, err)
        return null
      })
      .finally(() => {
        delete fetchPromises[instrumentId]
      })

    fetchPromises[instrumentId] = promise
    return promise
  }

  async function ensureSampleBuffer(instrumentId: string): Promise<AudioBuffer | null> {
    if (sampleBuffers[instrumentId]) return sampleBuffers[instrumentId]
    if (decodePromises[instrumentId] != null) return decodePromises[instrumentId]
    if (!audioContextRef.current) return null

    const data = sampleData[instrumentId] ?? (await fetchSampleData(instrumentId))
    if (!data) return null

    // data.slice(0) — ВАЖНО: decodeAudioData потребляет ArrayBuffer, slice
    // создаёт копию, чтобы данные можно было декодировать повторно.
    const decodePromise = audioContextRef.current
      .decodeAudioData(data.slice(0))
      .then((buffer) => {
        sampleBuffers[instrumentId] = buffer
        return buffer
      })
      .catch((err) => {
        console.warn(`Не удалось декодировать сэмпл "${instrumentId}":`, err)
        return null
      })
      .finally(() => {
        delete decodePromises[instrumentId]
      })

    decodePromises[instrumentId] = decodePromise
    return decodePromise
  }

  async function preloadAllSamples(): Promise<void> {
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext()
    }
    try {
      await Promise.all(ALL_INSTRUMENTS.map((inst) => ensureSampleBuffer(inst.id)))
      setSamplesLoaded(true)
    } catch (err) {
      console.warn('Предзагрузка сэмплов не удалась:', err)
      setSamplesLoaded(false)
    }
  }

  function prefetchAll(): void {
    ALL_INSTRUMENTS.forEach((inst) => {
      if (inst.sample) fetchSampleData(inst.id)
    })
  }

  return {
    setAudioContext(ctx) {
      audioContextRef.current = ctx
    },
    getBuffer(instrumentId) {
      return sampleBuffers[instrumentId]
    },
    ensureSampleBuffer,
    preloadAllSamples,
    prefetchAll,
    get samplesLoaded() {
      return samplesLoaded
    },
    onSamplesLoadedChange(cb) {
      listener = cb
    },
  }
}
