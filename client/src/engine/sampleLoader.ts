import { useRef, useCallback, useState } from 'react'
import {
  ALL_INSTRUMENTS,
  instrumentMetaById,
} from '../config'

export function useSampleLoader(audioContextRef: React.MutableRefObject<AudioContext | null>) {
  const sampleDataRef = useRef<Record<string, ArrayBuffer>>({})
  const sampleBufferRef = useRef<Record<string, AudioBuffer>>({})
  const sampleFetchPromisesRef = useRef<Record<string, Promise<ArrayBuffer | null>>>({})
  const sampleDecodePromisesRef = useRef<Record<string, Promise<AudioBuffer | null>>>({})
  const [samplesLoaded, setSamplesLoaded] = useState(false)

  const fetchSampleData = useCallback((instrumentId: string): Promise<ArrayBuffer | null> => {
    if (sampleDataRef.current[instrumentId]) {
      return Promise.resolve(sampleDataRef.current[instrumentId])
    }
    if (sampleFetchPromisesRef.current[instrumentId] != null) {
      return sampleFetchPromisesRef.current[instrumentId]
    }
    const samplePath = instrumentMetaById[instrumentId]?.sample
    if (!samplePath) return Promise.resolve(null)

    const promise = fetch(samplePath)
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.arrayBuffer()
      })
      .then(data => {
        sampleDataRef.current[instrumentId] = data
        return data
      })
      .catch(err => {
        console.warn(`Failed to fetch sample "${instrumentId}":`, err)
        return null
      })
      .finally(() => {
        delete sampleFetchPromisesRef.current[instrumentId]
      })

    sampleFetchPromisesRef.current[instrumentId] = promise
    return promise
  }, [])

  const ensureSampleBuffer = useCallback(async (instrumentId: string): Promise<AudioBuffer | null> => {
    if (sampleBufferRef.current[instrumentId]) {
      return sampleBufferRef.current[instrumentId]
    }
    if (sampleDecodePromisesRef.current[instrumentId] != null) {
      return sampleDecodePromisesRef.current[instrumentId]
    }
    if (!audioContextRef.current) return null

    const data = sampleDataRef.current[instrumentId] || (await fetchSampleData(instrumentId))
    if (!data) return null

    // data.slice(0) — ВАЖНО: decodeAudioData потребляет ArrayBuffer,
    // slice создаёт копию чтобы данные можно было декодировать повторно
    const decodePromise = audioContextRef.current
      .decodeAudioData(data.slice(0))
      .then(buffer => {
        sampleBufferRef.current[instrumentId] = buffer
        return buffer
      })
      .catch(err => {
        console.warn(`Failed to decode sample "${instrumentId}":`, err)
        return null
      })
      .finally(() => {
        delete sampleDecodePromisesRef.current[instrumentId]
      })

    sampleDecodePromisesRef.current[instrumentId] = decodePromise
    return decodePromise
  }, [fetchSampleData, audioContextRef])

  const preloadAllSamples = useCallback(async () => {
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext()
    }
    try {
      await Promise.all(ALL_INSTRUMENTS.map(inst => ensureSampleBuffer(inst.id)))
      setSamplesLoaded(true)
    } catch (err) {
      console.warn('Sample preload failed:', err)
      setSamplesLoaded(false)
    }
  }, [ensureSampleBuffer, audioContextRef])

  const prefetchAll = useCallback(() => {
    ALL_INSTRUMENTS.forEach(inst => {
      if (inst.sample) fetchSampleData(inst.id)
    })
  }, [fetchSampleData])

  return {
    sampleBufferRef,
    samplesLoaded,
    preloadAllSamples,
    prefetchAll,
    ensureSampleBuffer,
  }
}
