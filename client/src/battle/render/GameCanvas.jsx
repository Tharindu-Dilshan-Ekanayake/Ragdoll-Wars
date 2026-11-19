import { PerformanceMonitor } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { WebGLRenderer } from 'three'

import { useBloxityStore } from '../../bloxity/store'
import { RENDER_SCALES, useQuality } from '../../store/quality'
import ErrorBoundary from '../../ui/ErrorBoundary'
import { runFrameHooks } from '../state'
import PerfProbe from './PerfProbe'
import ShaderWarmup from './ShaderWarmup'

/**
 * The 3D view shell shared by the lobby and the battle: renderer set-up from the quality
 * preset, the automatic preset drop when FPS falls under 45, recovery from a lost WebGL
 * context, shader warm-up before the first frame, the one frame driver that runs every
 * frame hook in order, the perf probe and (dev, ?perf) r3f-perf.
 *
 * `onReady` fires once the shaders are compiled and a real frame has been drawn.
 */

// r3f-perf: dev-only overlay (?perf). Dropped from production builds entirely.
const DevPerf = import.meta.env.DEV ? lazy(() => import('r3f-perf').then((m) => ({ default: m.Perf }))) : null
const showDevPerf = import.meta.env.DEV && new URLSearchParams(window.location.search).has('perf')

/** The single useFrame: runs every frame hook in phase order. */
function FrameDriver() {
  useFrame((state, delta) => runFrameHooks(state, delta))
  return null
}

/** Signals once a real frame has been drawn after the shaders are warm. */
function FirstFrame({ onFirstFrame }) {
  const fired = useRef(false)
  useFrame(() => {
    if (fired.current) return
    fired.current = true
    setTimeout(onFirstFrame, 0)
  })
  return null
}

/** Keeps the camera's far plane in step with the preset's view distance. */
function ViewDistance({ far }) {
  const get = useThree((s) => s.get)
  useEffect(() => {
    const { camera } = get()
    camera.far = far
    camera.updateProjectionMatrix()
  }, [get, far])
  return null
}

/**
 * @param {{ clearColor: string, fogColor: string, fogRange?: [number, number],
 *   cameraFov?: number, onReady?: () => void, children: React.ReactNode }} props
 *   `fogRange` pulls the fog in closer than the preset's (never further out).
 */
export default function GameCanvas({ clearColor, fogColor, fogRange, cameraFov = 55, onReady, children }) {
  const settings = useQuality((s) => s.settings)
  const antialias = useQuality((s) => s.antialias)
  const rebuild = useQuality((s) => s.rebuild)
  const degrade = useQuality((s) => s.degrade)
  const recover = useQuality((s) => s.recover)
  const renderScale = useQuality((s) => RENDER_SCALES[s.renderStep])
  const adBreak = useBloxityStore((s) => s.adBreak)
  const [contextKey, setContextKey] = useState(0)
  const [contextLost, setContextLost] = useState(false)
  const canvasKey = `${contextKey}:${rebuild}`
  /** The canvas whose shaders have finished compiling (a rebuilt canvas warms again). */
  const [warmKey, setWarmKey] = useState(null)
  const warm = warmKey === canvasKey
  const readySent = useRef(false)

  const handleWarm = useCallback(() => setWarmKey(canvasKey), [canvasKey])
  const handleFirstFrame = useCallback(() => {
    if (readySent.current) return
    readySent.current = true
    onReady?.()
  }, [onReady])

  // A lost WebGL context (GPU reset, backgrounded phone) is recovered by remounting the
  // canvas. Game state lives outside it, so nothing but a moment of drawing is lost.
  const handleCreated = useCallback(
    ({ gl }) => {
      gl.setClearColor(clearColor)
      gl.debug.checkShaderErrors = import.meta.env.DEV
      const canvas = gl.domElement
      let timer = null
      const remount = () => {
        clearTimeout(timer)
        setContextLost(false)
        setContextKey((k) => k + 1)
      }
      canvas.addEventListener('webglcontextlost', (e) => {
        // A canvas already taken off the page was replaced on purpose: nothing to recover.
        if (!canvas.isConnected) return
        e.preventDefault()
        setContextLost(true)
        timer = setTimeout(remount, 1500)
      })
      canvas.addEventListener('webglcontextrestored', remount)
    },
    [clearColor],
  )

  // Never set state from the monitor's frame callback directly.
  const handleDecline = useCallback(() => setTimeout(degrade, 0), [degrade])
  const handleIncline = useCallback(() => setTimeout(recover, 0), [recover])
  const dpr = Math.min(settings.dpr, window.devicePixelRatio || 1) * renderScale

  const createRenderer = useMemo(
    () => (defaults) => new WebGLRenderer({ ...defaults, alpha: false, antialias, stencil: false, powerPreference: 'high-performance' }),
    [antialias],
  )

  return (
    <>
      <Canvas
        key={canvasKey}
        frameloop={adBreak ? 'never' : 'always'}
        dpr={dpr}
        gl={createRenderer}
        shadows={settings.shadows === 'realtime' ? 'percentage' : false}
        flat
        camera={{ position: [0, 20, 30], fov: cameraFov, near: 0.3, far: settings.viewDistance }}
        onCreated={handleCreated}
      >
        <fog
          attach="fog"
          args={[fogColor, Math.min(settings.fogNear, fogRange?.[0] ?? Infinity), Math.min(settings.viewDistance * 0.95, fogRange?.[1] ?? Infinity)]}
        />
        <ViewDistance far={settings.viewDistance} />
        <PerformanceMonitor bounds={() => [45, 58]} flipflops={4} onDecline={handleDecline} onIncline={handleIncline} />
        <FrameDriver />
        {children}
        <ShaderWarmup onDone={handleWarm} />
        {warm && <FirstFrame onFirstFrame={handleFirstFrame} />}
        <PerfProbe />
        {showDevPerf && DevPerf && (
          <ErrorBoundary>
            <Suspense fallback={null}>
              <DevPerf position="bottom-right" minimal />
            </Suspense>
          </ErrorBoundary>
        )}
      </Canvas>
      {contextLost && (
        <div className="ff-cover">
          <span>Reloading graphics…</span>
        </div>
      )}
    </>
  )
}
