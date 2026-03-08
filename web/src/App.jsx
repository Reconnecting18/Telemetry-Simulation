import { useState } from 'react'
import { useTelemetryData } from './hooks/useTelemetryData'
import { usePlayback } from './hooks/usePlayback'

import Header from './components/Header'
import PlaybackControls from './components/PlaybackControls'
import TrackMap from './components/TrackMap'
import CarModel from './components/CarModel'
import TireDetailPanel from './components/TireDetailPanel'
import StrategyPanel from './components/StrategyPanel'

function statusColor(frac) {
  if (frac < 0.4) return '#7ed321'
  if (frac < 0.7) return '#f5a623'
  if (frac < 0.9) return '#ff6b00'
  return '#e10600'
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
  const {
    currentTime, maxTime, isPlaying, playbackSpeed,
    interpolatedFrame, toggle, seekTo, setPlaybackSpeed,
  } = usePlayback(data?.frames)

  const [mode, setMode] = useState('default')

  if (error) return <div className="state-msg error">Failed to load telemetry: {error}</div>
  if (!data) return <div className="state-msg">Loading telemetry data...</div>

  const f = interpolatedFrame
  const v = data.vehicle

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
      <Header session={data.session} vehicle={v} track={data.track} currentLap={f?.lap} />

      <PlaybackControls
        currentTime={currentTime}
        maxTime={maxTime}
        isPlaying={isPlaying}
        playbackSpeed={playbackSpeed}
        frames={data.frames}
        onToggle={toggle}
        onSeek={seekTo}
        onSetSpeed={setPlaybackSpeed}
      />

      <div className="main-area">
        {/* Left: Track Map */}
        <div className="track-panel">
          <TrackMap
            trackNodes={data.track?.nodes}
            frames={data.frames}
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
              <StrategyPanel session={data.session} frames={data.frames} />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
