import { memo } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ReferenceLine,
} from 'recharts'

function TimeChartInner({ title, data, lines, currentTime, onSeek }) {
  const handleClick = (e) => {
    if (e && e.activeLabel != null && onSeek) {
      onSeek(e.activeLabel)
    }
  }

  return (
    <div className="chart-card">
      <h3>{title}</h3>
      <ResponsiveContainer width="100%" height={180}>
        <LineChart data={data}
          margin={{ top: 4, right: 16, left: 0, bottom: 4 }}
          onClick={handleClick}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" />
          <XAxis
            dataKey="time_s"
            tick={{ fontSize: 10, fill: '#888' }}
            label={{ value: 'Time (s)', position: 'insideBottomRight', offset: -4, fill: '#666', fontSize: 10 }}
            type="number"
            domain={['dataMin', 'dataMax']}
          />
          <YAxis tick={{ fontSize: 10, fill: '#888' }} width={48} />
          <Tooltip
            contentStyle={{ background: '#1a1a1a', border: '1px solid #333', fontSize: 11 }}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          {currentTime != null && (
            <ReferenceLine x={currentTime} stroke="#00a8a8" strokeDasharray="4 2" strokeWidth={2} />
          )}
          {lines.map(({ key, name, color }) => (
            <Line
              key={key}
              type="monotone"
              dataKey={key}
              name={name}
              stroke={color}
              dot={false}
              strokeWidth={1.5}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

export default memo(TimeChartInner)
