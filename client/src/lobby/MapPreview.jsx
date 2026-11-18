import { useEffect, useState } from 'react'

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
      <rect x={-hw} y={-hd} width={map.width} height={map.depth} rx="3" fill="#7a9a4c" />
      <rect x={-hw} y={-hd} width={map.width / 2} height={map.depth} fill="#3d78dc" opacity="0.12" />
      <rect x={0} y={-hd} width={map.width / 2} height={map.depth} fill="#d64545" opacity="0.12" />
      {map.mud.map(([x, z, r], i) => (
        <circle key={`m${i}`} cx={x} cy={z} r={r} fill="#5b4731" opacity="0.45" />
      ))}
      {map.roads.map((r, i) => (
        <polyline key={`r${i}`} points={r.points.map((p) => p.join(',')).join(' ')} fill="none" stroke="#8c6f4a" strokeWidth={r.width * 1.6} strokeLinecap="round" strokeLinejoin="round" opacity="0.85" />
      ))}
      {map.obstacles.map((o, i) =>
        o.kind === 'tree' ? (
          <circle key={i} cx={o.x} cy={o.z} r="2.2" fill={KIND_FILL.tree} />
        ) : (
          <rect key={i} x={o.x - o.w / 2} y={o.z - o.d / 2} width={o.w} height={o.d} fill={KIND_FILL[o.kind] || '#ccc'} stroke="rgba(0,0,0,0.35)" strokeWidth="0.3" />
        ),
      )}
      <rect x={-hw} y={-hd} width={map.width} height={map.depth} rx="3" fill="none" stroke="#5a4028" strokeWidth="1" />
    </svg>
  )
}
