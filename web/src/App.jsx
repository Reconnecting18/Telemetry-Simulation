import { useMemo } from 'react'
import { useTelemetryData } from './hooks/useTelemetryData'
import { usePlayback } from './hooks/usePlayback'
import { COLORS } from './utils/colors'

import Header from './components/Header'
import PlaybackControls from './components/PlaybackControls'
import TrackMap from './components/TrackMap'
import TimeChart from './components/TimeChart'
import Speedometer from './components/Speedometer'
import RevCounter from './components/RevCounter'
import GearDisplay from './components/GearDisplay'
import GForceMeter from './components/GForceMeter'
import ThrottleBrakeBar from './components/ThrottleBrakeBar'
import CarDiagram from './components/CarDiagram'
import TireTempDisplay from './components/TireTempDisplay'
import WearIndicators from './components/WearIndicators'
import CamberDisplay from './components/CamberDisplay'

export default function App() {
  const { data, error } = useTelemetryData()
  const {
    currentTime, maxTime, isPlaying, playbackSpeed,
    interpolatedFrame, toggle, seekTo, setPlaybackSpeed,
  } = usePlayback(data?.frames)

  // Pre-compute chart data with rounded values
  const chartData = useMemo(() => {
    if (!data) return []
    return data.frames.map(f => ({
      time_s:      +f.time_s.toFixed(2),
      velocity_ms: +f.velocity_ms.toFixed(2),
      lateral_g:   +f.lateral_g.toFixed(3),
      long_g:      +f.longitudinal_g.toFixed(3),
      drag_N:      +f.drag_force_N.toFixed(0),
      fuel_L:      +f.fuel_L.toFixed(3),
      throttle:    +(f.throttle * 100).toFixed(1),
      brake:       +(f.brake * 100).toFixed(1),
      tire_FL:     +(f.tire_wear.FL * 100).toFixed(3),
      tire_FR:     +(f.tire_wear.FR * 100).toFixed(3),
      tire_RL:     +(f.tire_wear.RL * 100).toFixed(3),
      tire_RR:     +(f.tire_wear.RR * 100).toFixed(3),
      temp_FL:     +f.tire_temp_C.FL.toFixed(1),
      temp_FR:     +f.tire_temp_C.FR.toFixed(1),
      temp_RL:     +f.tire_temp_C.RL.toFixed(1),
      temp_RR:     +f.tire_temp_C.RR.toFixed(1),
    }))
  }, [data])

  if (error) return <div className="state-msg error">Failed to load telemetry: {error}</div>
  if (!data) return <div className="state-msg">Loading telemetry data...</div>

  const f = interpolatedFrame
  const v = data.vehicle

  return (
    <div className="dashboard">
      <Header session={data.session} vehicle={v} track={data.track} currentLap={f?.lap} />

      <PlaybackControls
        currentTime={currentTime}
        maxTime={maxTime}
        isPlaying={isPlaying}
        playbackSpeed={playbackSpeed}
        onToggle={toggle}
        onSeek={seekTo}
        onSetSpeed={setPlaybackSpeed}
      />

      <div className="main-panels">
        {/* Left: Track Map */}
        <div className="track-panel">
          <TrackMap
            trackNodes={data.track?.nodes}
            carX={f?.x}
            carY={f?.y}
          />
        </div>

        {/* Right: Gauges and indicators */}
        <div className="instruments-panel">
          <div className="gauges-row">
            <Speedometer velocity_ms={f?.velocity_ms || 0} maxSpeed={v?.max_speed_ms || 91} />
            <RevCounter rpm={f?.rpm || 0} maxRpm={v?.max_rpm || 15000} shiftRpm={v?.shift_rpm || 14500} />
            <GearDisplay gear={f?.gear || 1} />
            <GForceMeter lateralG={f?.lateral_g || 0} longitudinalG={f?.longitudinal_g || 0} />
            <ThrottleBrakeBar throttle={f?.throttle || 0} brake={f?.brake || 0} />
          </div>
          <div className="indicators-row">
            <CarDiagram frame={f} vehicle={v} />
            <TireTempDisplay frame={f} vehicle={v} />
            <WearIndicators frame={f} />
            <CamberDisplay vehicle={v} />
          </div>
        </div>
      </div>

      {/* Charts grid */}
      <div className="charts-grid">
        <TimeChart
          title="Velocity (m/s)"
          data={chartData}
          lines={[{ key: 'velocity_ms', name: 'Velocity', color: COLORS.velocity }]}
          currentTime={currentTime}
          onSeek={seekTo}
        />
        <TimeChart
          title="G-Forces"
          data={chartData}
          lines={[
            { key: 'lateral_g', name: 'Lateral G', color: COLORS.lateral_g },
            { key: 'long_g', name: 'Longitudinal G', color: COLORS.long_g },
          ]}
          currentTime={currentTime}
          onSeek={seekTo}
        />
        <TimeChart
          title="Throttle / Brake (%)"
          data={chartData}
          lines={[
            { key: 'throttle', name: 'Throttle', color: COLORS.throttle },
            { key: 'brake', name: 'Brake', color: COLORS.brake },
          ]}
          currentTime={currentTime}
          onSeek={seekTo}
        />
        <TimeChart
          title="Tire Wear (%)"
          data={chartData}
          lines={[
            { key: 'tire_FL', name: 'FL', color: COLORS.FL },
            { key: 'tire_FR', name: 'FR', color: COLORS.FR },
            { key: 'tire_RL', name: 'RL', color: COLORS.RL },
            { key: 'tire_RR', name: 'RR', color: COLORS.RR },
          ]}
          currentTime={currentTime}
          onSeek={seekTo}
        />
        <TimeChart
          title="Tire Temperature (C)"
          data={chartData}
          lines={[
            { key: 'temp_FL', name: 'FL', color: COLORS.FL },
            { key: 'temp_FR', name: 'FR', color: COLORS.FR },
            { key: 'temp_RL', name: 'RL', color: COLORS.RL },
            { key: 'temp_RR', name: 'RR', color: COLORS.RR },
          ]}
          currentTime={currentTime}
          onSeek={seekTo}
        />
        <TimeChart
          title="Drag Force (N)"
          data={chartData}
          lines={[{ key: 'drag_N', name: 'Drag', color: COLORS.drag }]}
          currentTime={currentTime}
          onSeek={seekTo}
        />
        <TimeChart
          title="Fuel Level (L)"
          data={chartData}
          lines={[{ key: 'fuel_L', name: 'Fuel', color: COLORS.fuel }]}
          currentTime={currentTime}
          onSeek={seekTo}
        />
      </div>
    </div>
  )
}
