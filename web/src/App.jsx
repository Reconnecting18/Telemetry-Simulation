import { useEffect, useState } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'

const COLORS = {
  velocity:   '#e10600',
  lateral_g:  '#f5a623',
  long_g:     '#4a90e2',
  drag:       '#7ed321',
  fuel:       '#9b9b9b',
  FL:         '#e10600',
  FR:         '#f5a623',
  RL:         '#4a90e2',
  RR:         '#7ed321',
}

function Chart({ title, data, lines }) {
  return (
    <div className="chart-card">
      <h3>{title}</h3>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={data} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" />
          <XAxis dataKey="node" tick={{ fontSize: 11, fill: '#888' }} label={{ value: 'Node', position: 'insideBottomRight', offset: -4, fill: '#666', fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11, fill: '#888' }} width={52} />
          <Tooltip contentStyle={{ background: '#1a1a1a', border: '1px solid #333', fontSize: 12 }} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {lines.map(({ key, name, color, dot }) => (
            <Line
              key={key}
              type="monotone"
              dataKey={key}
              name={name}
              stroke={color}
              dot={dot ?? false}
              strokeWidth={1.5}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

export default function App() {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetch('/telemetry.json')
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then(json => {
        const frames = json.frames.map(f => ({
          node:        f.node,
          velocity_ms: +f.velocity_ms.toFixed(2),
          lateral_g:   +f.lateral_g.toFixed(3),
          long_g:      +f.longitudinal_g.toFixed(3),
          drag_N:      +f.drag_force_N.toFixed(0),
          fuel_L:      +f.fuel_L.toFixed(3),
          tire_FL:     +(f.tire_wear.FL * 100).toFixed(4),
          tire_FR:     +(f.tire_wear.FR * 100).toFixed(4),
          tire_RL:     +(f.tire_wear.RL * 100).toFixed(4),
          tire_RR:     +(f.tire_wear.RR * 100).toFixed(4),
        }))
        setData({ meta: json, frames })
      })
      .catch(e => setError(e.message))
  }, [])

  if (error) return <div className="state-msg error">Failed to load telemetry: {error}</div>
  if (!data)  return <div className="state-msg">Loading telemetry data…</div>

  const { meta, frames } = data
  const v = meta.vehicle

  return (
    <div className="dashboard">
      <header>
        <div className="header-title">
          <span className="accent">&#9632;</span> Telemetry Dashboard
        </div>
        <div className="header-stats">
          <Stat label="Track"   value={meta.session.track.split('/').pop()} />
          <Stat label="Nodes"   value={meta.session.total_nodes} />
          <Stat label="Mass"    value={`${v.mass_kg} kg`} />
          <Stat label="Top Speed" value={`${v.max_speed_ms} m/s`} />
          <Stat label="Fuel Cap" value={`${v.fuel_capacity_L} L`} />
        </div>
      </header>

      <main className="grid">
        <Chart
          title="Velocity (m/s)"
          data={frames}
          lines={[{ key: 'velocity_ms', name: 'Velocity', color: COLORS.velocity }]}
        />
        <Chart
          title="G-Forces"
          data={frames}
          lines={[
            { key: 'lateral_g', name: 'Lateral G',      color: COLORS.lateral_g },
            { key: 'long_g',    name: 'Longitudinal G', color: COLORS.long_g },
          ]}
        />
        <Chart
          title="Tire Wear (%)"
          data={frames}
          lines={[
            { key: 'tire_FL', name: 'FL', color: COLORS.FL },
            { key: 'tire_FR', name: 'FR', color: COLORS.FR },
            { key: 'tire_RL', name: 'RL', color: COLORS.RL },
            { key: 'tire_RR', name: 'RR', color: COLORS.RR },
          ]}
        />
        <Chart
          title="Drag Force (N)"
          data={frames}
          lines={[{ key: 'drag_N', name: 'Drag', color: COLORS.drag }]}
        />
        <Chart
          title="Fuel Level (L)"
          data={frames}
          lines={[{ key: 'fuel_L', name: 'Fuel', color: COLORS.fuel }]}
        />
      </main>
    </div>
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
