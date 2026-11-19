import { useEffect, useMemo } from 'react'
import {
  AdditiveBlending,
  Color,
  DynamicDrawUsage,
  Euler,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  MeshLambertMaterial,
  PlaneGeometry,
  Quaternion,
  RingGeometry,
  Vector3,
} from 'three'

import { useQuality } from '../../store/quality'
import { CREW, MAX_JETS, MAX_VEHICLES, jetPosition } from '../sim/vehicles'
import { addFrameHook, battle, PHASE } from '../state'
import { buildCrewGeometries, crewMaterial } from './crewModel'
import { buildHelicopterGeometry, MAIN_ROTOR_PIVOT, TAIL_ROTOR_PIVOT } from './helicopterModel'
import { createParticles, spawnParticle, stepParticles } from './particles'
import { getTextures } from './textures'
import { buildVehicleGeometries, helicopterTrim } from './vehicleModels'

/**
 * Every vehicle on the battlefield: per kind, one instanced mesh each for the body, the
 * turret (or a helicopter's rotors) and the team-coloured trim. Wrecks are drawn
 * charred with flames for a while (and smoke on presets with particles); a hit flashes
 * the body. The crew ride in them (crewModel.js, two instanced meshes for every crewman
 * of every vehicle, in their team's uniform) until it's destroyed - then the sim throws
 * them out. Strike jets streak over, and selected vehicles get a ring.
 *
 * Empty meshes are hidden: a battle without vehicles costs nothing here.
 */

const GROUND = ['jeep', 'apc', 'tank']
const AIR = ['gunship', 'scout']
const ALL = [...GROUND, ...AIR]
const TEAM_RGB = [new Color('#3d78dc'), new Color('#d64545')]
const RING_RGB = [new Color('#7fb4ff'), new Color('#ff8a8a')]
/** The crew's uniform, as the soldiers wear it (Soldiers.jsx TEAM_COLORS). */
const CREW_RGB = [new Color('#3f7ddf'), new Color('#d84848')]
const MAX_CREW = MAX_VEHICLES * 4

const mBody = new Matrix4()
const mPart = new Matrix4()
const mLocal = new Matrix4()
const mTop = new Matrix4()
const mSeat = new Matrix4()
const mCrew = new Matrix4()
const qSeat = new Quaternion()
const seatP = new Vector3()
const one = new Vector3(1, 1, 1)
const q = new Quaternion()
const qSpin = new Quaternion()
const e = new Euler(0, 0, 0, 'YXZ')
const p = new Vector3()
const s = new Vector3()
const pivot = new Vector3()
const yAxis = new Vector3(0, 1, 0)
const xAxis = new Vector3(1, 0, 0)
const jetPos = { x: 0, y: 0, z: 0 }

function instanced(geo, mat, n, withColor) {
  const mesh = new InstancedMesh(geo, mat, n)
  mesh.instanceMatrix.setUsage(DynamicDrawUsage)
  if (withColor) {
    mesh.instanceColor = new InstancedBufferAttribute(new Float32Array(n * 3), 3)
    mesh.instanceColor.setUsage(DynamicDrawUsage)
  }
  mesh.frustumCulled = false
  mesh.count = 0
  mesh.visible = false
  return mesh
}

function commit(mesh, n) {
  mesh.count = n
  mesh.visible = n > 0
  if (!n) return
  mesh.instanceMatrix.clearUpdateRanges()
  mesh.instanceMatrix.addUpdateRange(0, n * 16)
  mesh.instanceMatrix.needsUpdate = true
  if (mesh.instanceColor) {
    mesh.instanceColor.clearUpdateRanges()
    mesh.instanceColor.addUpdateRange(0, n * 3)
    mesh.instanceColor.needsUpdate = true
  }
}

function setColor(mesh, i, r, g, b) {
  const a = mesh.instanceColor.array
  a[i * 3] = r
  a[i * 3 + 1] = g
  a[i * 3 + 2] = b
}

export default function Vehicles() {
  const realtimeShadows = useQuality((st) => st.settings.shadows === 'realtime')
  const particlesOn = useQuality((st) => st.settings.particles)

  const rig = useMemo(() => {
    const geos = buildVehicleGeometries()
    const heli = buildHelicopterGeometry()
    // The gunship carries stub wings and rocket pods.
    const heliArmed = buildHelicopterGeometry({ armed: true })
    heliArmed.mainRotor.dispose()
    heliArmed.tailRotor.dispose()
    const heliTrim = helicopterTrim()
    const crewGeo = buildCrewGeometries()
    const tex = getTextures()
    const mats = {
      body: new MeshLambertMaterial({ vertexColors: true }),
      crew: crewMaterial(),
      trim: new MeshLambertMaterial({ color: '#ffffff' }),
      shadow: new MeshBasicMaterial({ map: tex.blob, transparent: true, depthWrite: false }),
      ring: new MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.9, depthWrite: false }),
      fire: new MeshBasicMaterial({ map: tex.flash, transparent: true, blending: AdditiveBlending, depthWrite: false, toneMapped: false }),
    }
    const card = new PlaneGeometry(1, 1)
    const flat = new PlaneGeometry(1, 1).rotateX(-Math.PI / 2)
    const ringGeo = new RingGeometry(0.88, 1, 36).rotateX(-Math.PI / 2)
    const n = MAX_VEHICLES
    const kinds = {}
    for (const k of GROUND) {
      kinds[k] = {
        body: instanced(geos[k].body, mats.body, n, true),
        top: instanced(geos[k].top, mats.body, n, true),
        trim: instanced(geos[k].trim, mats.trim, n, true),
        pivot: geos[k].pivot,
      }
    }
    for (const k of AIR) {
      kinds[k] = {
        body: instanced(k === 'gunship' ? heliArmed.body : heli.body, mats.body, n, true),
        top: instanced(heli.mainRotor, mats.body, n, true),
        tail: instanced(heli.tailRotor, mats.body, n, true),
        trim: instanced(heliTrim, mats.trim, n, true),
      }
    }
    const crew = { seated: instanced(crewGeo.seated, mats.crew, MAX_CREW, true), hatch: instanced(crewGeo.hatch, mats.crew, MAX_CREW, true) }
    const jets = instanced(geos.jet, mats.body, MAX_JETS, false)
    const shadows = instanced(flat, mats.shadow, n + MAX_JETS, false)
    shadows.renderOrder = 1
    const rings = instanced(ringGeo, mats.ring, n, true)
    rings.renderOrder = 2
    const fires = instanced(card, mats.fire, n * 2, true)
    const allGeos = [geos.jeep.body, geos.jeep.top, geos.jeep.trim, geos.apc.body, geos.apc.top, geos.apc.trim, geos.tank.body, geos.tank.top, geos.tank.trim, geos.jet, heli.body, heliArmed.body, heli.mainRotor, heli.tailRotor, heliTrim, crewGeo.seated, crewGeo.hatch, card, flat, ringGeo]
    const counts = Object.fromEntries(ALL.map((k) => [k, 0]))
    return { kinds, crew, jets, shadows, rings, fires, mats, counts, geos: allGeos }
  }, [])

  const smoke = useMemo(() => (particlesOn ? createParticles(260, false) : null), [particlesOn])

  useEffect(
    () => () => {
      for (const g of rig.geos) g.dispose()
      for (const m of Object.values(rig.mats)) m.dispose()
    },
    [rig],
  )
  useEffect(() => () => smoke?.dispose(), [smoke])

  useEffect(() => {
    let smokeT = 0
    return addFrameHook(PHASE.DRAW, (state, delta) => {
      const w = battle.world
      if (!w) return
      const time = w.time
      const dt = Math.min(0.05, delta) * w.timeScale
      const camQ = state.camera.quaternion
      const counts = rig.counts
      for (let k = 0; k < ALL.length; k += 1) counts[ALL[k]] = 0
      let nShadow = 0
      let nRing = 0
      let nFire = 0
      let nSeated = 0
      let nHatch = 0
      smokeT -= dt
      const puff = smokeT <= 0
      if (puff) smokeT = 0.12

      const list = w.veh.list
      for (let i = 0; i < list.length; i += 1) {
        const v = list[i]
        if (!v.used) continue
        const kind = rig.kinds[v.type]
        const idx = counts[v.type]++
        const sc = v.spec.scale || 1
        const y = v.y + v.dropY
        e.set(v.pitch, v.yaw, v.roll, 'YXZ')
        q.setFromEuler(e)
        mBody.compose(p.set(v.x, y, v.z), q, s.set(sc, sc, sc))
        mBody.toArray(kind.body.instanceMatrix.array, idx * 16)
        mBody.toArray(kind.trim.instanceMatrix.array, idx * 16)
        // Charred when wrecked, a white flash when hit.
        const dead = v.wreck || v.crashing
        const flash = !dead && v.hitT < 0.07 ? 1.8 : 1
        const shade = dead ? 0.2 : flash
        setColor(kind.body, idx, shade, shade, shade)
        const tc = TEAM_RGB[v.team]
        setColor(kind.trim, idx, tc.r * (dead ? 0.2 : 1), tc.g * (dead ? 0.2 : 1), tc.b * (dead ? 0.2 : 1))
        if (v.spec.air) {
          // Rotors spin (slowing to a stop on a wreck).
          const spin = dead ? (v.wreck ? 0 : time * 10) : time * 28 + v.seed
          qSpin.setFromAxisAngle(yAxis, spin)
          mLocal.compose(pivot.set(MAIN_ROTOR_PIVOT[0], MAIN_ROTOR_PIVOT[1], MAIN_ROTOR_PIVOT[2]), qSpin, s.set(1, 1, 1))
          mPart.multiplyMatrices(mBody, mLocal)
          mPart.toArray(kind.top.instanceMatrix.array, idx * 16)
          qSpin.setFromAxisAngle(xAxis, spin * 2.2)
          mLocal.compose(pivot.set(TAIL_ROTOR_PIVOT[0], TAIL_ROTOR_PIVOT[1], TAIL_ROTOR_PIVOT[2]), qSpin, s.set(1, 1, 1))
          mPart.multiplyMatrices(mBody, mLocal)
          mPart.toArray(kind.tail.instanceMatrix.array, idx * 16)
          setColor(kind.top, idx, shade, shade, shade)
          setColor(kind.tail, idx, shade, shade, shade)
        } else {
          // The turret turns on its own (world yaw); it rides the body's tilt.
          pivot.set(kind.pivot[0], kind.pivot[1], kind.pivot[2]).applyMatrix4(mBody)
          e.set(v.pitch, v.turretYaw, v.roll, 'YXZ')
          q.setFromEuler(e)
          mTop.compose(pivot, q, s.set(sc, sc, sc))
          mTop.toArray(kind.top.instanceMatrix.array, idx * 16)
          setColor(kind.top, idx, shade, shade, shade)
        }
        // The crew, while it's still a working vehicle.
        const seats = CREW[v.type]
        if (seats && !dead) {
          const cc = CREW_RGB[v.team]
          for (let c = 0; c < seats.length; c += 1) {
            const seat = seats[c]
            qSeat.setFromAxisAngle(yAxis, seat.yaw)
            mSeat.compose(seatP.set(seat.x, seat.y, seat.z), qSeat, one)
            mCrew.multiplyMatrices(seat.frame === 'top' ? mTop : mBody, mSeat)
            const mesh = seat.pose === 'hatch' ? rig.crew.hatch : rig.crew.seated
            const at = seat.pose === 'hatch' ? nHatch++ : nSeated++
            mCrew.toArray(mesh.instanceMatrix.array, at * 16)
            setColor(mesh, at, cc.r, cc.g, cc.b)
          }
        }
        if (!realtimeShadows || v.spec.air) {
          const lift = Math.min(1, y / 40)
          const size = v.spec.radius * 2.6 * (1 + lift * 0.5) * sc
          mPart.compose(p.set(v.x, 0.03 + i * 0.0005, v.z), q.identity(), s.set(size, 1, size * (v.spec.air ? 1.6 : 1.3)))
          mPart.toArray(rig.shadows.instanceMatrix.array, nShadow * 16)
          nShadow += 1
        }
        if (v.selected && v.alive) {
          const r = v.spec.radius * 1.35 * sc
          mPart.compose(p.set(v.x, 0.05, v.z), q.identity(), s.set(r, 1, r))
          mPart.toArray(rig.rings.instanceMatrix.array, nRing * 16)
          const rc = RING_RGB[v.team]
          setColor(rig.rings, nRing, rc.r, rc.g, rc.b)
          nRing += 1
        }
        // A wreck burns for a while, then smoulders.
        if (dead) {
          const burning = v.crashing || v.wreckT < 12
          if (burning) {
            for (let k = 0; k < 2; k += 1) {
              const sz = v.spec.radius * (k ? 0.9 : 1.3) * (0.8 + Math.random() * 0.4) * sc
              mPart.compose(p.set(v.x + (k - 0.5) * 0.8, y + 1.4 + k * 0.3, v.z), camQ, s.set(sz, sz * 1.3, sz))
              mPart.toArray(rig.fires.instanceMatrix.array, nFire * 16)
              setColor(rig.fires, nFire, 1, 0.5, 0.15)
              nFire += 1
            }
          }
          if (smoke && puff && v.wreckT < 22) {
            const g = 0.16 + Math.random() * 0.08
            spawnParticle(smoke, v.x + (Math.random() - 0.5), y + 1.8, v.z + (Math.random() - 0.5), (Math.random() - 0.5) * 0.5, 1.6, (Math.random() - 0.5) * 0.5, g, g, g, 1.2, 2.6, 3, 0.4, 0.55)
          }
        }
      }
      for (let a = 0; a < ALL.length; a += 1) {
        const k = ALL[a]
        const kind = rig.kinds[k]
        const n = counts[k]
        commit(kind.body, n)
        commit(kind.top, n)
        commit(kind.trim, n)
        if (kind.tail) commit(kind.tail, n)
      }

      // Strike jets.
      let nJ = 0
      for (const j of w.veh.jets) {
        if (!j.active) continue
        jetPosition(j, jetPos)
        e.set(0, Math.atan2(j.dx, j.dz), Math.sin(time * 2) * 0.05, 'YXZ')
        q.setFromEuler(e)
        const sc = j.big ? 1.5 : 1
        mPart.compose(p.set(jetPos.x, jetPos.y, jetPos.z), q, s.set(sc, sc, sc))
        mPart.toArray(rig.jets.instanceMatrix.array, nJ * 16)
        nJ += 1
      }
      commit(rig.jets, nJ)
      commit(rig.crew.seated, nSeated)
      commit(rig.crew.hatch, nHatch)
      commit(rig.shadows, nShadow)
      commit(rig.rings, nRing)
      commit(rig.fires, nFire)
      if (smoke) stepParticles(smoke, dt, state.size.height)
    })
  }, [rig, smoke, realtimeShadows])

  const { kinds } = rig
  return (
    <group>
      {ALL.map((k) => (
        <group key={k}>
          <primitive object={kinds[k].body} castShadow={realtimeShadows} />
          <primitive object={kinds[k].top} castShadow={realtimeShadows} />
          <primitive object={kinds[k].trim} />
          {kinds[k].tail && <primitive object={kinds[k].tail} />}
        </group>
      ))}
      <primitive object={rig.crew.seated} />
      <primitive object={rig.crew.hatch} />
      <primitive object={rig.jets} />
      <primitive object={rig.shadows} />
      <primitive object={rig.rings} />
      <primitive object={rig.fires} />
      {smoke && <primitive object={smoke.points} />}
    </group>
  )
}
