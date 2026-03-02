const END_LABELS = {
  fuel:        'Fuel Empty',
  tire_wear:   'Tires Worn',
  tire_damage: 'Tire Damage',
  max_laps:    'Max Laps',
}

export default function Header({ session, vehicle, track, currentLap }) {
  const totalLaps = session?.total_laps
  const endReason = session?.end_reason
  return (
    <header>
      <div className="header-title">
        <span className="accent">&#9632;</span> Telemetry Dashboard
      </div>
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
