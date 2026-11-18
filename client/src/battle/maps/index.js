/**
 * The battlefields. Only this list is in the start-up bundle: each map's data (and the
 * whole 3D battle) loads on demand when it's picked.
 */
export const MAPS = [
  {
    id: 'training',
    name: 'Training Grounds',
    blurb: 'A muddy army yard: sandbag nests, barrier lines, containers and a ruined compound in the middle.',
    size: '170 × 110 m',
    load: () => import('./trainingGrounds.js'),
  },
]

export const mapById = (id) => MAPS.find((m) => m.id === id) || MAPS[0]
