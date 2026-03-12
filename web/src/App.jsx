import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import { useTelemetryData } from './hooks/useTelemetryData'
import { usePlayback } from './hooks/usePlayback'
import { logCornerAnalysis, analyzeCorners } from './utils/cornerDetection'
import { calculateSpeedEnvelope, calculateBrakingPoints } from './utils/speedEnvelope'
import { generateRacingLine } from './utils/racingLine'

import Header from './components/Header'
import PlaybackControls from './components/PlaybackControls'
import TrackMap from './components/TrackMap'
import CarModelViews from './components/CarModelViews'
import TireDetailPanel from './components/TireDetailPanel'
import StrategyPanel, { defaultStint, defaultModifiers } from './components/StrategyPanel'
import LapTimePanel from './components/LapTimePanel'

const API_URL = import.meta.env.VITE_SIMULATION_API_URL

// Map StrategyBuilder compound IDs to C++ engine names
const COMPOUND_MAP = { S: 'soft', M: 'medium', H: 'hard', I: 'intermediate', W: 'wet' }

function transformPayload(payload) {
  return {
    stints: payload.stints.map(s => ({
      compound: COMPOUND_MAP[s.compound] || s.compound.toLowerCase(),
      tire_age: s.tireAge ?? 0,
      fuel_load: s.fuelLoad ?? 100,
      lap_count: s.lapCount ?? 10,
    })),
    modifiers: {
      wear_multiplier: payload.modifiers?.wearMultiplier ?? 1.0,
      fuel_multiplier: payload.modifiers?.fuelMultiplier ?? 1.0,
      weather: (payload.modifiers?.weather || 'dry').toLowerCase(),
      track_temp: payload.modifiers?.trackTemp ?? 35,
      ambient_temp: payload.modifiers?.ambientTemp ?? 25,
    },
  }
}


export default function App() {
  const { data, error } = useTelemetryData()

  // Simulation state
  const [simulatedData, setSimulatedData] = useState(null)
  const [simStatus, setSimStatus] = useState('idle') // idle | simulating | success | fallback
  const [dataSource, setDataSource] = useState('static') // static | engine | estimate
  const [lastSubmittedStrategy, setLastSubmittedStrategy] = useState(null)

  // Strategy builder state — owned by App so it persists across any child remount
  const [totalLaps, setTotalLaps] = useState(26)
  const [durationType, setDurationType] = useState('laps')
  const [durationMinutes, setDurationMinutes] = useState(60)
  const [strategyStints, setStrategyStints] = useState(() => [defaultStint(0)])
  const [strategyModifiers, setStrategyModifiers] = useState(defaultModifiers)
  const [strategyDirty, setStrategyDirty] = useState(false)
  const simRanOnceRef = useRef(false)

  // Active data: simulated results take priority over static telemetry
  const activeFrames = simulatedData?.frames || data?.frames
  const activeSession = simulatedData?.session || data?.session
  const activeVehicle = simulatedData?.vehicle || data?.vehicle
  const activeWeather = simulatedData?.weather || data?.weather
  const activePitStops = simulatedData ? (simulatedData.pit_stops ?? []) : (data?.pitStops ?? [])

  const {
    currentTime, maxTime, isPlaying, playbackSpeed,
    interpolatedFrame, toggle, seekTo, setPlaybackSpeed,
  } = usePlayback(activeFrames)

  const [mode, setMode] = useState('default')

  // Detect strategy edits after a successful sim (results become stale)
  useEffect(() => {
    if (simRanOnceRef.current) setStrategyDirty(true)
  }, [totalLaps, durationType, durationMinutes, strategyStints, strategyModifiers])

  // Reset with confirmation — the only way to reset strategy
  const handleStrategyReset = useCallback(() => {
    if (!window.confirm('Reset strategy to defaults?')) return
    setTotalLaps(26)
    setDurationType('laps')
    setDurationMinutes(60)
    setStrategyStints([defaultStint(0)])
    setStrategyModifiers(defaultModifiers())
  }, [])

  // API call handler
  const handleRunSimulation = useCallback(async (payload) => {
    setSimStatus('simulating')

    try {
      const body = transformPayload(payload)
      setLastSubmittedStrategy(body)
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 30000)

      const res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      })
      clearTimeout(timeout)

      if (!res.ok) throw new Error(`API ${res.status}`)

      const json = await res.json()
      // The API returns the full telemetry JSON (session, vehicle, frames, track, weather)
      const result = typeof json.body === 'string' ? JSON.parse(json.body) : json

      if (result.frames?.length) {
        setSimulatedData(result)
        setDataSource('engine')
        setSimStatus('success')
        seekTo(0)
        simRanOnceRef.current = true
        setStrategyDirty(false)
      } else {
        throw new Error('No frames in response')
      }
    } catch (err) {
      console.error('Simulation API error:', err)
      setSimStatus('fallback')
      setDataSource('estimate')
      // Keep showing static data — StrategyPanel can show its local estimate
    }
  }, [seekTo])

  // Corner analysis + speed envelope + racing line (computed once on data load)
  const { speedData, corners, generatedLine } = useMemo(() => {
    if (!data?.track) return { speedData: null, corners: [], generatedLine: null }
    const c = analyzeCorners(data.track)
    logCornerAnalysis(data.track)
    const spd = calculateSpeedEnvelope(data.track, c)
    const rl = generateRacingLine(data.track, c)
    return { speedData: spd, corners: c, generatedLine: rl }
  }, [data?.track])

  // Dynamic braking points — recalculate when fuel/wear changes
  const f = interpolatedFrame
  const brakingPoints = useMemo(() => {
    if (!data?.track || !speedData || !corners.length) return null
    const vehicle = activeVehicle || data?.vehicle
    return calculateBrakingPoints(data.track, speedData, corners, null, {
      fuel_L: f?.fuel_L,
      tire_wear: f?.tire_wear,
      base_fuel_L: vehicle?.fuel_capacity_L,
    })
  }, [data?.track, activeVehicle, speedData, corners, f?.fuel_L, f?.tire_wear])

  if (error) return <div className="state-msg error">Failed to load telemetry: {error}</div>
  if (!data) return <div className="state-msg">Loading telemetry data...</div>

  const v = activeVehicle || data.vehicle

  return (
    <div className="dashboard">
      <Header session={activeSession} vehicle={v} track={data.track} weather={activeWeather} currentLap={f?.lap} dataSource={dataSource} />

      <PlaybackControls
        currentTime={currentTime}
        maxTime={maxTime}
        isPlaying={isPlaying}
        playbackSpeed={playbackSpeed}
        frames={activeFrames}
        pitStops={activePitStops}
        lastSubmittedStrategy={lastSubmittedStrategy}
        onToggle={toggle}
        onSeek={seekTo}
        onSetSpeed={setPlaybackSpeed}
      />

      <div className="main-area">
        {/* Left: Track Map */}
        <div className="track-panel">
          <TrackMap
            trackNodes={data.track?.nodes}
            racingLineData={data.track?.racing_line}
            speedData={speedData}
            brakingPoints={brakingPoints}
            generatedLine={generatedLine}
            frames={activeFrames}
            currentTime={currentTime}
            carX={f?.x}
            carY={f?.y}
          />
        </div>

        {/* Right: content area */}
        <div className="content-area">
          {/* Upper row: Car Model + Tire Detail */}
          <div className="upper-row">
            <div className="car-panel">
              <div className="panel-toggle">
                {['default', 'temp', 'wear'].map(m => (
                  <button key={m} className={`toggle-btn ${mode === m ? 'active' : ''}`}
                    onClick={() => setMode(m)}>
                    {m === 'default' ? 'Default' : m === 'temp' ? 'Temp' : 'Wear'}
                  </button>
                ))}
              </div>
              <CarModelViews frame={f} vehicle={v} mode={mode} />
            </div>

            <div className="tire-panel">
              <TireDetailPanel frame={f} mode={mode} />
            </div>
          </div>

          {/* Bottom row: Lap Time Analysis + Race Strategy */}
          <div className="bottom-row">
            <div className="health-panel">
              <LapTimePanel frames={activeFrames} pitStops={activePitStops} currentLap={f?.lap} />
            </div>

            <div className="strategy-panel">
              <StrategyPanel
                session={activeSession}
                frames={activeFrames}
                onRunSimulation={handleRunSimulation}
                simStatus={simStatus}
                totalLaps={totalLaps} setTotalLaps={setTotalLaps}
                durationType={durationType} setDurationType={setDurationType}
                durationMinutes={durationMinutes} setDurationMinutes={setDurationMinutes}
                stints={strategyStints} setStints={setStrategyStints}
                modifiers={strategyModifiers} setModifiers={setStrategyModifiers}
                strategyDirty={strategyDirty}
                onReset={handleStrategyReset}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
