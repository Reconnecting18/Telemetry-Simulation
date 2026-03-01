import { useState, useRef, useCallback, useEffect } from 'react'
import { interpolateFrame, findFrameIndex } from '../utils/interpolate'

export function usePlayback(frames) {
  const [currentTime, setCurrentTime] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [playbackSpeed, setPlaybackSpeed] = useState(1)
  const rafRef = useRef(null)
  const lastTsRef = useRef(null)

  const maxTime = frames ? frames[frames.length - 1].time_s : 0

  const tick = useCallback((timestamp) => {
    if (lastTsRef.current !== null) {
      const dt = (timestamp - lastTsRef.current) / 1000
      setCurrentTime(prev => {
        const next = prev + dt * playbackSpeed
        if (next >= maxTime) {
          return next - maxTime  // loop back to start
        }
        return next
      })
    }
    lastTsRef.current = timestamp
    rafRef.current = requestAnimationFrame(tick)
  }, [playbackSpeed, maxTime])

  useEffect(() => {
    if (isPlaying) {
      lastTsRef.current = null
      rafRef.current = requestAnimationFrame(tick)
    } else {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [isPlaying, tick])

  const toggle = useCallback(() => {
    if (!isPlaying && currentTime >= maxTime) {
      setCurrentTime(0)
    }
    setIsPlaying(p => !p)
  }, [isPlaying, currentTime, maxTime])

  const seekTo = useCallback((t) => {
    setCurrentTime(Math.max(0, Math.min(t, maxTime)))
  }, [maxTime])

  // Compute interpolated frame
  let interpolatedFrame = frames ? frames[0] : null
  let currentIndex = 0
  if (frames && frames.length > 1) {
    const idx = findFrameIndex(frames, currentTime)
    currentIndex = idx
    if (idx < frames.length - 1) {
      const a = frames[idx]
      const b = frames[idx + 1]
      const range = b.time_s - a.time_s
      const t = range > 0 ? (currentTime - a.time_s) / range : 0
      interpolatedFrame = interpolateFrame(a, b, Math.max(0, Math.min(1, t)))
    } else {
      interpolatedFrame = frames[frames.length - 1]
    }
  }

  return {
    currentTime,
    currentIndex,
    maxTime,
    isPlaying,
    playbackSpeed,
    interpolatedFrame,
    toggle,
    seekTo,
    setPlaybackSpeed,
  }
}
