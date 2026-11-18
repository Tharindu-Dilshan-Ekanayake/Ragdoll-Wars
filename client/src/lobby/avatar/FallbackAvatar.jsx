import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { BoxGeometry, MeshLambertMaterial } from 'three'

import { computePose } from './playerPose'

/**
 * A blocky stand-in figure, shown while your Bloxity avatar streams in (or if it can't
 * load at all). Posed from the same motion state, so walking and jumping look the same.
 */
export default function FallbackAvatar({ motionRef, onReady }) {
  const parts = useMemo(
    () => ({
      torso: new BoxGeometry(0.52, 0.64, 0.3),
      head: new BoxGeometry(0.4, 0.4, 0.4),
      arm: new BoxGeometry(0.18, 0.62, 0.18).translate(0, -0.29, 0),
      leg: new BoxGeometry(0.22, 0.84, 0.22).translate(0, -0.42, 0),
      shirt: new MeshLambertMaterial({ color: '#5a7fb8' }),
      pants: new MeshLambertMaterial({ color: '#2f3442' }),
      skin: new MeshLambertMaterial({ color: '#f1c9a5' }),
    }),
    [],
  )
  useEffect(
    () => () => {
      for (const v of Object.values(parts)) v.dispose()
    },
    [parts],
  )
  useEffect(() => {
    onReady?.()
  }, [onReady])

  const body = useRef(null)
  const torso = useRef(null)
  const armL = useRef(null)
  const armR = useRef(null)
  const legL = useRef(null)
  const legR = useRef(null)

  useFrame(() => {
    const motion = motionRef?.current
    if (!motion || !body.current) return
    const pose = computePose(motion)
    const b = pose.bones
    body.current.position.y = pose.lift
    torso.current.rotation.set(b.Spine1.swing, b.Spine1.twist, 0)
    armL.current.rotation.set(b.ArmL1.swing, 0, b.ArmL1.sway)
    armR.current.rotation.set(b.ArmR1.swing, 0, b.ArmR1.sway)
    legL.current.rotation.set(b.LegL1.swing, 0, b.LegL1.sway)
    legR.current.rotation.set(b.LegR1.swing, 0, b.LegR1.sway)
  })

  return (
    <group ref={body}>
      <group ref={torso} position={[0, 0.88, 0]}>
        <mesh geometry={parts.torso} material={parts.shirt} position={[0, 0.34, 0]} />
        <mesh geometry={parts.head} material={parts.skin} position={[0, 0.88, 0]} />
        <mesh ref={armL} geometry={parts.arm} material={parts.shirt} position={[0.36, 0.6, 0]} />
        <mesh ref={armR} geometry={parts.arm} material={parts.shirt} position={[-0.36, 0.6, 0]} />
      </group>
      <mesh ref={legL} geometry={parts.leg} material={parts.pants} position={[0.13, 0.86, 0]} />
      <mesh ref={legR} geometry={parts.leg} material={parts.pants} position={[-0.13, 0.86, 0]} />
    </group>
  )
}
