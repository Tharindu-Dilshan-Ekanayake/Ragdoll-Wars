import { useEffect, useRef, useState } from 'react'

import { lobby } from './lobbyState'

/** Joystick travel radius, in CSS pixels. */
const RADIUS = 54

function detectTouch() {
  if (typeof window === 'undefined') return false
  return window.matchMedia?.('(pointer: coarse)').matches || navigator.maxTouchPoints > 0
}

/**
 * Touch controls for walking: a floating joystick wherever the bottom-left of the screen
 * is touched, and a jump button. Writes straight into `lobby.input` and moves the knob
 * through refs, so dragging never re-renders React.
 */
export default function TouchStick() {
  const [isTouch, setIsTouch] = useState(detectTouch)
  const baseRef = useRef(null)
  const knobRef = useRef(null)
  const active = useRef({ id: null, x: 0, y: 0 })

  // A touchscreen laptop can start with a mouse: show the controls on first touch.
  useEffect(() => {
    if (isTouch) return undefined
    const onTouch = (e) => {
      if (e.pointerType === 'touch') setIsTouch(true)
    }
    window.addEventListener('pointerdown', onTouch)
    return () => window.removeEventListener('pointerdown', onTouch)
  }, [isTouch])

  useEffect(
    () => () => {
      lobby.input.joyX = 0
      lobby.input.joyY = 0
      lobby.input.jump = false
    },
    [],
  )

  if (!isTouch) return null

  const onDown = (e) => {
    if (active.current.id !== null) return
    e.currentTarget.setPointerCapture(e.pointerId)
    const rect = e.currentTarget.getBoundingClientRect()
    active.current = { id: e.pointerId, x: e.clientX - rect.left, y: e.clientY - rect.top }
    const base = baseRef.current
    if (base) {
      base.style.opacity = '1'
      base.style.left = `${active.current.x - RADIUS}px`
      base.style.top = `${active.current.y - RADIUS}px`
    }
  }
  const onMove = (e) => {
    const a = active.current
    if (a.id !== e.pointerId) return
    const rect = e.currentTarget.getBoundingClientRect()
    let dx = e.clientX - rect.left - a.x
    let dy = e.clientY - rect.top - a.y
    const len = Math.hypot(dx, dy)
    if (len > RADIUS) {
      dx = (dx / len) * RADIUS
      dy = (dy / len) * RADIUS
    }
    if (knobRef.current) knobRef.current.style.transform = `translate(${dx}px, ${dy}px)`
    // Small dead zone so a resting thumb doesn't creep.
    const strength = Math.max(0, Math.min(len, RADIUS) / RADIUS - 0.08) / 0.92
    lobby.input.joyX = len > 0 ? (dx / Math.min(len, RADIUS)) * strength : 0
    lobby.input.joyY = len > 0 ? (-dy / Math.min(len, RADIUS)) * strength : 0
  }
  const onUp = (e) => {
    if (active.current.id !== e.pointerId) return
    active.current.id = null
    lobby.input.joyX = 0
    lobby.input.joyY = 0
    if (knobRef.current) knobRef.current.style.transform = 'translate(0px, 0px)'
    if (baseRef.current) {
      baseRef.current.style.opacity = '0.45'
      baseRef.current.style.left = ''
      baseRef.current.style.top = ''
    }
  }
  const jump = (on) => (e) => {
    e.preventDefault()
    lobby.input.jump = on
  }

  return (
    <>
      <div className="ff-stick-zone" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
        <div ref={baseRef} className="ff-stick" style={{ width: RADIUS * 2, height: RADIUS * 2 }}>
          <div ref={knobRef} className="ff-stick__knob" style={{ width: RADIUS, height: RADIUS, left: RADIUS / 2, top: RADIUS / 2 }} />
        </div>
      </div>
      <button type="button" aria-label="Jump" className="ff-jump" onPointerDown={jump(true)} onPointerUp={jump(false)} onPointerCancel={jump(false)} onPointerLeave={jump(false)}>
        <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" strokeWidth="3.5">
          <path d="M5 15l7-7 7 7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </>
  )
}
