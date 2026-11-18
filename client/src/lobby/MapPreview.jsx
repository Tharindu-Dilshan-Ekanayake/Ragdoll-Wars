import { useEffect, useState } from 'react'

import { mapPieces } from '../battle/sim/pieces'

/**
 * A top-down sketch of a battlefield, drawn as SVG from the map's own data (loaded on
 * demand, a few KB): roads, mud, every piece of cover, and each team's side.
 */
const KIND_FILL = {
  sandbag: '#c9b483',
  barrier: '#d8d4ca',
  lowwall: '#bdb7aa',
  wall: '#9d988d',
  crate: '#b07a42',
  container: '#a8462f',
  shed: '#8f6c48',
  tree: '#3e6b34',
}

const PIECE_FILL = {
  rock: '#8d8a84',
  sandwall: '#b9a278',
  bunker: '#a6a197',
  tower: '#7a5a3a',
  ruin: '#9d988d',
  rubble: '#8a857c',
  carwreck: '#7a4a32',
  palm: '#4f8a3a',
  snowpine: '#2d5a36',
  deadtree: '#5a4a3a',
  cactus: '#4f7d3a',
  dune: '#c9ab72',
  teeth: '#b4afa5',
  tanktrap: '#5b5f63',
}

export default function MapPreview({ entry }) {
  const [map, setMap] = useState(null)
  useEffect(() => {
    let cancelled = false
    entry.load().then((m) => {
      if (!cancelled) setMap(m.default)
    })
    return () => {
      cancelled = true
    }
  }, [entry])

  if (!map) return <div className="ff-preview ff-preview--loading" />
  const hw = map.width / 2
  const hd = map.depth / 2
  return (
    <svg className="ff-preview" viewBox={`${-hw - 4} ${-hd - 4} ${map.width + 8} ${map.depth + 8}`} aria-label={`${map.name} map`}>
      {map.sea && <rect x={-hw - 4} y={-hd - 4} width={map.width + 8} height={Math.max(4.5, map.sea.z + hd + 4)} fill="#2d6fc4" />}
      <rect x={-hw} y={-hd} width={map.width} height={map.depth} rx="3" fill={map.theme?.grassA || '#7a9a4c'} />
      <rect x={-hw} y={-hd} width={map.width / 2} height={map.depth} fill="#3d78dc" opacity="0.12" />
      <rect x={0} y={-hd} width={map.width / 2} height={map.depth} fill="#d64545" opacity="0.12" />
      {map.mud.map(([x, z, r], i) => (
        <circle key={`m${i}`} cx={x} cy={z} r={r} fill="#5b4731" opacity="0.45" />
      ))}
      {(map.ice || []).map((r, i) => (
        <polyline key={`i${i}`} points={r.points.map((p) => p.join(',')).join(' ')} fill="none" stroke="#c4e0f0" strokeWidth={r.width * 1.8} strokeLinecap="round" strokeLinejoin="round" />
      ))}
      {map.roads.map((r, i) => (
        <polyline key={`r${i}`} points={r.points.map((p) => p.join(',')).join(' ')} fill="none" stroke={map.theme ? `rgb(${map.theme.road.join(',')})` : '#8c6f4a'} strokeWidth={r.width * 1.6} strokeLinecap="round" strokeLinejoin="round" opacity="0.85" />
      ))}
      {map.obstacles.map((o, i) =>
        o.kind === 'tree' ? (
          <circle key={i} cx={o.x} cy={o.z} r="2.2" fill={KIND_FILL.tree} />
        ) : (
          <rect key={i} x={o.x - o.w / 2} y={o.z - o.d / 2} width={o.w} height={o.d} fill={KIND_FILL[o.kind] || '#ccc'} stroke="rgba(0,0,0,0.35)" strokeWidth="0.3" />
        ),
      )}
      {mapPieces(map).map((p, i) =>
        p.boxes.map((o, j) => <rect key={`p${i}-${j}`} x={o.x - o.w / 2} y={o.z - o.d / 2} width={o.w} height={o.d} fill={PIECE_FILL[p.key] || '#9a958c'} stroke="rgba(0,0,0,0.3)" strokeWidth="0.3" />),
      )}
      <rect x={-hw} y={-hd} width={map.width} height={map.depth} rx="3" fill="none" stroke="#5a4028" strokeWidth="1" />
    </svg>
  )
}
