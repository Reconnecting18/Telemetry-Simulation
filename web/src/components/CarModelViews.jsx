import { memo } from 'react'
import CarModel from './CarModel'

// Thin wrapper — passes all props through to the animated top-down CarModel.
// FRONT/SIDE/REAR blueprint views removed.

function CarModelViews({ frame, vehicle, mode, hasSimData }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ flex: 1, minHeight: 0 }}>
        <CarModel frame={frame} vehicle={vehicle} mode={mode} hasSimData={hasSimData} />
      </div>
    </div>
  )
}

export default memo(CarModelViews)
