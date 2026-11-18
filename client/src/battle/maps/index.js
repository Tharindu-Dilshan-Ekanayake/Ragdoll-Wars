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
  {
    id: 'depot',
    name: 'Ironhold Depot',
    blurb: 'An army supply depot: steel warehouses and loading bays, container yards stacked two high, hesco walls, towers and a checkpoint in the middle.',
    size: '170 × 110 m',
    load: () => import('./ironholdDepot.js'),
  },
  {
    id: 'jungle',
    name: 'Monsoon Outpost',
    blurb: 'Jungle camps either side of a misty river: stilt huts, watchtowers and helipads in clearings, thick jungle cover and overgrown ruins between.',
    size: '170 × 110 m',
    load: () => import('./monsoonOutpost.js'),
  },
  {
    id: 'rustyard',
    name: 'Rustline Yard',
    blurb: 'A rusting scrapyard turned battlefield: rusted sheds, container stacks, rows of wrecks and scrap heaps under a dusty sky, an army camp at each end.',
    size: '170 × 110 m',
    load: () => import('./rustlineYard.js'),
  },
]

/** Zombie Horde's own battlefield (not in the sandbox map list). */
export const ZOMBIE_MAP = {
  id: 'bastion',
  name: 'Mirefall Bastion',
  blurb: 'A stone rampart across a drowned, misty marsh: hold it against the horde from the top of the wall.',
  size: '170 × 110 m',
  load: () => import('./mirefallBastion.js'),
}

/** Every battlefield, sandbox and Zombie Horde. */
export const ALL_MAPS = [...MAPS, ZOMBIE_MAP]

export const mapById = (id) => ALL_MAPS.find((m) => m.id === id) || MAPS[0]
