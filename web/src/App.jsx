import { useState, useMemo, useCallback } from 'react'
import { useTelemetryData } from './hooks/useTelemetryData'
import { usePlayback } from './hooks/usePlayback'
import { logCornerAnalysis, analyzeCorners } from './utils/cornerDetection'
import { calculateSpeedEnvelope, calculateBrakingPoints } from './utils/speedEnvelope'
import { generateRacingLine } from './utils/racingLine'

import Header from './components/Header'
import PlaybackControls from './components/PlaybackControls'
import TrackMap from './components/TrackMap'
import CarModel from './components/CarModel'
import TireDetailPanel from './components/TireDetailPanel'
import StrategyPanel from './components/StrategyPanel'

const API_URL = import.meta.env.VITE_SIMULATION_API_URL

// Map StrategyBuilder compound IDs to C++ engine names
const COMPOUND_MAP = { S: 'soft', M: 'medium', H: 'hard' }

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

function statusColor(frac) {
  if (frac < 0.4) return '#00e676'
  if (frac < 0.7) return '#f5a623'
  if (frac < 0.9) return '#ff6b00'
  return '#ff3d3d'
}

function StatusBar({ label, value, fraction }) {
  const color = statusColor(fraction)
  return (
    <div className="status-row">
      <span className="status-label">{label}</span>
      <div className="status-track">
        <div className="status-fill" style={{ width: `${fraction * 100}%`, background: color }} />
      </div>
      <span className="status-value" style={{ color }}>{value}</span>
    </div>
  )
}

export default function App() {
  const { data, error } = useTelemetryData()

  // Simulation state
  const [simulatedData, setSimulatedData] = useState(null)
  const [simStatus, setSimStatus] = useState('idle') // idle | simulating | success | fallback
  const [dataSource, setDataSource] = useState('static') // static | engine | estimate

  // Active data: simulated results take priority over static telemetry
  const activeFrames = simulatedData?.frames || data?.frames
  const activeSession = simulatedData?.session || data?.session
  const activeVehicle = simulatedData?.vehicle || data?.vehicle
  const activeWeather = simulatedData?.weather || data?.weather

  const {
    currentTime, maxTime, isPlaying, playbackSpeed,
    interpolatedFrame, toggle, seekTo, setPlaybackSpeed,
  } = usePlayback(activeFrames)

  const [mode, setMode] = useState('default')

  // API call handler
  const handleRunSimulation = useCallback(async (payload) => {
    setSimStatus('simulating')

    try {
      const body = transformPayload(payload)
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
    return calculateBrakingPoints(data.track, speedData, corners, null, {
      fuel_L: f?.fuel_L,
      tire_wear: f?.tire_wear,
      base_fuel_L: data.vehicle?.fuel_capacity_L,
    })
  }, [data?.track, speedData, corners, f?.fuel_L, f?.tire_wear])

  if (error) return <div className="state-msg error">Failed to load telemetry: {error}</div>
  if (!data) return <div className="state-msg">Loading telemetry data...</div>

  const v = activeVehicle || data.vehicle

  // Mechanical indicators
  const rpm = f?.rpm || 0
  const mRpm = v?.max_rpm || 9000
  const engineLoad = Math.min(1, (rpm / mRpm) * 0.65 + (f?.throttle || 0) * 0.35)
  const brakeHeat  = f?.brake || 0
  const avgWear    = ((f?.tire_wear?.FL || 0) + (f?.tire_wear?.FR || 0)
                    + (f?.tire_wear?.RL || 0) + (f?.tire_wear?.RR || 0)) / 4
  const gearboxWear = Math.min(1, avgWear * 0.4)

  return (
    <div className="dashboard">
      <Header session={activeSession} vehicle={v} track={data.track} weather={activeWeather} currentLap={f?.lap} />

      <PlaybackControls
        currentTime={currentTime}
        maxTime={maxTime}
        isPlaying={isPlaying}
        playbackSpeed={playbackSpeed}
        frames={activeFrames}
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
              <CarModel frame={f} vehicle={v} mode={mode} />
            </div>

            <div className="tire-panel">
              <TireDetailPanel frame={f} mode={mode} />
            </div>
          </div>

          {/* Bottom row: Mechanical Health + Race Strategy */}
          <div className="bottom-row">
            <div className="health-panel">
              <h4 className="panel-title">Mechanical Health</h4>
              <div className="status-bars">
                <StatusBar label="Engine"  value={`${(engineLoad * 100).toFixed(0)}%`}  fraction={engineLoad} />
                <StatusBar label="Brakes"  value={`${(brakeHeat * 100).toFixed(0)}%`}   fraction={brakeHeat} />
                <StatusBar label="Gearbox" value={`${(gearboxWear * 100).toFixed(1)}%`} fraction={gearboxWear} />
              </div>
            </div>

            <div className="strategy-panel">
              <StrategyPanel
                session={activeSession}
                frames={activeFrames}
                onRunSimulation={handleRunSimulation}
                simStatus={simStatus}
              />
              {dataSource !== 'static' && (
                <div className={`source-badge ${dataSource}`}>
                  {dataSource === 'engine' ? 'Physics Engine' : 'Strategy Estimate'}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
