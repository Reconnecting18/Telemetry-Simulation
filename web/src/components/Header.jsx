export default function Header({ session, vehicle, track }) {
  return (
    <header>
      <div className="header-title">
        <span className="accent">&#9632;</span> Telemetry Dashboard
      </div>
      <div className="header-stats">
        <Stat label="Track" value={track?.name || session?.track?.split('/').pop()} />
        <Stat label="Nodes" value={session?.total_nodes} />
        <Stat label="Distance" value={`${(track?.total_distance_m || 0).toFixed(0)} m`} />
        <Stat label="Mass" value={`${vehicle?.mass_kg} kg`} />
        <Stat label="Top Speed" value={`${((vehicle?.max_speed_ms || 0) * 3.6).toFixed(0)} km/h`} />
        <Stat label="Gears" value={vehicle?.num_gears} />
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
