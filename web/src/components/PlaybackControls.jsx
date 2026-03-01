const SPEEDS = [0.25, 0.5, 1, 2, 5]

function formatTime(s) {
  const mins = Math.floor(s / 60)
  const secs = (s % 60).toFixed(1)
  return `${mins}:${secs.padStart(4, '0')}`
}

export default function PlaybackControls({
  currentTime, maxTime, isPlaying, playbackSpeed,
  onToggle, onSeek, onSetSpeed
}) {
  return (
    <div className="playback-controls">
      <button className="play-btn" onClick={onToggle}>
        {isPlaying ? '\u275A\u275A' : '\u25B6'}
      </button>
      <input
        className="scrubber"
        type="range"
        min={0}
        max={maxTime}
        step={0.01}
        value={currentTime}
        onChange={e => onSeek(parseFloat(e.target.value))}
      />
      <span className="time-display">
        {formatTime(currentTime)} / {formatTime(maxTime)}
      </span>
      <div className="speed-btns">
        {SPEEDS.map(s => (
          <button
            key={s}
            className={`speed-btn ${playbackSpeed === s ? 'active' : ''}`}
            onClick={() => onSetSpeed(s)}
          >
            {s}x
          </button>
        ))}
      </div>
    </div>
  )
}
