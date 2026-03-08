import { useTelemetryData } from './hooks/useTelemetryData'
import { usePlayback } from './hooks/usePlayback'

import Header from './components/Header'
import PlaybackControls from './components/PlaybackControls'
import TrackMap from './components/TrackMap'
import TelemetrySidebar from './components/TelemetrySidebar'

export default function App() {
  const { data, error } = useTelemetryData()
  const {
    currentTime, maxTime, isPlaying, playbackSpeed,
    interpolatedFrame, toggle, seekTo, setPlaybackSpeed,
  } = usePlayback(data?.frames)

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
        frames={data.frames}
        onToggle={toggle}
        onSeek={seekTo}
        onSetSpeed={setPlaybackSpeed}
      />

      <div className="main-panels">
        <div className="track-panel">
          <TrackMap
            trackNodes={data.track?.nodes}
            carX={f?.x}
            carY={f?.y}
          />
        </div>

        <TelemetrySidebar
          frame={f}
          vehicle={v}
          maxRpm={v?.max_rpm}
        />
      </div>
    </div>
  )
}
