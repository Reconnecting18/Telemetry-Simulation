const END_LABELS = {
  fuel:        'Fuel Empty',
  tire_wear:   'Tires Worn',
  tire_damage: 'Tire Damage',
  max_laps:    'Max Laps',
}

const WEATHER_ICONS = {
  dry:  { symbol: '\u2600', color: '#f5a623' },   // sun
  damp: { symbol: '\u26C5', color: '#8899aa' },   // sun behind cloud
  wet:  { symbol: '\uD83C\uDF27\uFE0F', color: '#5588cc' }, // rain
}

export default function Header({ session, vehicle, track, weather, currentLap }) {
  const totalLaps = session?.total_laps
  const endReason = session?.end_reason
  const cond = weather?.condition || 'dry'
  const icon = WEATHER_ICONS[cond] || WEATHER_ICONS.dry
  return (
    <header>
      <div className="header-title">
        <span className="accent">&#9632;</span> Telemetry Dashboard
      </div>
      {weather && (
        <div className="weather-badge">
          <span className="weather-icon" style={{ color: icon.color }}>{icon.symbol}</span>
          <div className="weather-temps">
            <span className="weather-temp">
              <span className="weather-temp-label">Track</span>
              <span className="weather-temp-value">{weather.track_temp_C?.toFixed(0)}°C</span>
            </span>
            <span className="weather-temp">
              <span className="weather-temp-label">Air</span>
              <span className="weather-temp-value">{weather.ambient_temp_C?.toFixed(0)}°C</span>
            </span>
          </div>
          <span className="weather-cond">{cond}</span>
        </div>
      )}
      <div className="header-stats">
        <Stat label="Track"    value={track?.name || session?.track?.split('/').pop()} />
        <Stat label="Distance" value={`${(track?.total_distance_m || 0).toFixed(0)} m`} />
        <Stat label="Lap"      value={totalLaps ? `${currentLap ?? '—'} / ${totalLaps}` : (currentLap ?? '—')} />
        <Stat label="Session"  value={END_LABELS[endReason] || endReason || '—'} />
        <Stat label="Mass"     value={`${vehicle?.mass_kg} kg`} />
        <Stat label="Top Speed" value={`${((vehicle?.max_speed_ms || 0) * 3.6).toFixed(0)} km/h`} />
        <Stat label="Gears"    value={vehicle?.num_gears} />
      </div>
    </header>
  )
}

function Stat({ label, value }) {
  return (
    <div className="stat">
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
    </div>
  )
}
