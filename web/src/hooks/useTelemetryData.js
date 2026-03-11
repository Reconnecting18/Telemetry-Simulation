import { useEffect, useState } from 'react'

export function useTelemetryData() {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetch('/telemetry.json')
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then(json => {
        setData({
          session: json.session,
          vehicle: json.vehicle,
          track: json.track,
          frames: json.frames,
          pitStops: json.pit_stops || [],
        })
      })
      .catch(e => setError(e.message))
  }, [])

  return { data, error }
}
