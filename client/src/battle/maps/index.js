/**
 * The battlefields. Only this list is in the start-up bundle: each map's data (and the
 * whole 3D battle) loads on demand when it's picked.
 */
export const MAPS = [
  {
    id: 'warehouse',
    name: 'Steelbay Warehouse',
    blurb: 'An indoor arena in a cleared-out warehouse: a bright tiled floor, clean concrete cover, pillars and tall slabs, and a walled base in each team colour with a helipad and bunker.',
    size: '150 × 100 m',
    load: () => import('./steelbayWarehouse.js'),
  },
  {
    id: 'training',
    name: 'Training Grounds',
    blurb: 'An army training base: barracks round a parade ground, Nissen huts, a motor pool, an assault course, a rifle range, firing trenches and a killhouse you fight through room by room.',
    size: '220 × 140 m',
    load: () => import('./trainingGrounds.js'),
  },
  {
    id: 'harbor',
    name: 'Saltgate Harbour',
    blurb: 'A working container port: cargo ships under gantry cranes, piers into the basins, a container terminal, rail yard, warehouses and a tank farm.',
    size: '170 × 110 m',
    load: () => import('./saltgateHarbour.js'),
  },
  {
    id: 'airbase',
    name: 'Kestrel Airfield',
    blurb: 'A military air base: a marked runway and taxiway, a transport plane under the control tower, hangars, fighters in hesco revetments, radar and fuel points.',
    size: '170 × 110 m',
    load: () => import('./kestrelAirfield.js'),
  },
  {
    id: 'desert',
    name: 'Sunscar Village',
    blurb: 'A desert town round a market square: adobe houses and walled yards, market stalls, a domed house, a water tower and a palm oasis, fortified outposts in the dunes.',
    size: '170 × 110 m',
    load: () => import('./sunscarVillage.js'),
  },
  {
    id: 'depot',
    name: 'Ironhold Depot',
    blurb: 'An army supply depot: warehouses with loading docks and trucks, an ordered container yard, a rail spur with wagons, the depot office, hesco walls and a checkpoint in the middle.',
    size: '170 × 110 m',
    load: () => import('./ironholdDepot.js'),
  },
  {
    id: 'jungle',
    name: 'Monsoon Outpost',
    blurb: 'Jungle stockades of stilt huts either side of a misty river crossed only at a plank bridge, a rope footbridge and a ford; temple ruins and thick jungle between.',
    size: '170 × 110 m',
    load: () => import('./monsoonOutpost.js'),
  },
  {
    id: 'rustyard',
    name: 'Rustline Yard',
    blurb: 'A scrapyard behind rusted sheet walls: aisles of crushed cars, scrap heaps under magnet cranes, a car crusher, scrap wagons and an army camp at each end.',
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
