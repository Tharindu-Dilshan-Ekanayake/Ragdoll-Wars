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
  {
    id: 'dustbowl',
    name: 'Dustbowl Ridge',
    blurb: 'A desert valley: gabion lines, stone compounds, rock outcrops and dunes round an old walled fort and its palm oasis.',
    size: '180 × 110 m',
    load: () => import('./dustbowlRidge.js'),
  },
  {
    id: 'whiteout',
    name: 'Whiteout Pass',
    blurb: "A snowbound pass split by a frozen creek: log cabins, bunkers, watchtowers and stands of snowy pine.",
    size: '170 × 110 m',
    load: () => import('./whiteoutPass.js'),
  },
  {
    id: 'saltmarsh',
    name: 'Saltmarsh Landing',
    blurb: "A long beach by the open sea: bunkers in the dunes, tank traps on the wet sand, palms along the back.",
    size: '170 × 110 m',
    load: () => import('./saltmarshLanding.js'),
  },
  {
    id: 'rubble',
    name: 'Rubble Row',
    blurb: 'A bombed-out town: ruined houses, burnt-out cars, rubble and roadblocks along cracked streets.',
    size: '170 × 110 m',
    load: () => import('./rubbleRow.js'),
  },
]

export const mapById = (id) => MAPS.find((m) => m.id === id) || MAPS[0]
