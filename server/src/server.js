import cors from 'cors'
import express from 'express'
import { defineRoom, defineServer } from '@colyseus/core'
import { WebSocketTransport } from '@colyseus/ws-transport'

import { resolveIdentity } from './bloxityApi.js'
import { bloxity } from './bloxityEnv.js'
import { installRoomReporter } from './legionRoomReporter.js'
import { BattleRoom } from './rooms/BattleRoom.js'

/**
 * Floppy Front's multiplayer server: Colyseus battle rooms (BattleRoom.js) running the
 * game's own simulation, plus the HTTP endpoints Bloxity Legion and the SDK expect.
 */

// Bloxity Legion injects PORT (HTTP and WebSocket share it); 2567 is Colyseus's usual.
const PORT = Number(process.env.PORT || 2567)

/**
 * Browser origins allowed to call /api: Legion's CLIENT_ORIGIN (the game's site), the
 * Bloxity-hosted frontends (<game>.<play host> and its dev channel), extra ones from
 * CLIENT_ORIGINS, and local Vite servers in development.
 */
const ALLOWED_ORIGINS = [
  process.env.CLIENT_ORIGIN,
  bloxity.playHost && `https://${bloxity.gameId}.${bloxity.playHost}`,
  bloxity.playHost && `https://${bloxity.gameId}.dev.${bloxity.playHost}`,
  ...(process.env.CLIENT_ORIGINS || '').split(',').map((s) => s.trim()),
  ...(process.env.NODE_ENV === 'production' ? [] : ['http://localhost:5173', 'http://localhost:4173', 'http://127.0.0.1:4173', 'http://localhost:5180']),
].filter(Boolean)

function routes(app) {
  // Legion's readiness and liveness probes.
  app.get('/health', (_req, res) => {
    res.json({ ok: true })
  })

  app.use('/api', cors({ origin: ALLOWED_ORIGINS, credentials: true }))
  app.use('/api', express.json())

  app.get('/api/health', (_req, res) => {
    // `game` lets a development client tell this server from another project's.
    res.json({ ok: true, game: 'floppy-front' })
  })

  /**
   * Auth passthrough for the Bloxity SDK: `Legion.SDK.auth.authenticateWithServer`
   * POSTs `{ token }`; the token is checked with Boxity, never trusted as is.
   */
  app.post('/api/legion-auth', async (req, res) => {
    const token = req.body?.token
    if (typeof token !== 'string' || !token) return res.status(401).json({ error: 'Missing token' })
    try {
      const identity = await resolveIdentity({ token })
      if (!identity.verified) return res.status(401).json({ error: 'Token not verified' })
      res.json({ accessToken: token, user: { legionId: identity.playerId } })
    } catch {
      res.status(401).json({ error: 'Invalid token' })
    }
  })
}

const server = defineServer({
  transport: new WebSocketTransport(),
  rooms: {
    // Quick match puts you with players in the same mode.
    battle: defineRoom(BattleRoom).filterBy(['mode']).enableRealtimeListing(),
  },
  express: routes,
  greet: false,
})

const stopTimers = []
server.onShutdown(() => {
  for (const stop of stopTimers) stop()
})

await server.listen(PORT)
// Boxity's "Open Rooms" list, fed from this pod.
stopTimers.push(installRoomReporter())
console.log(`[server] Floppy Front listening on port ${PORT} (Boxity ${bloxity.env})${process.env.POD_NAME ? ` (${process.env.POD_NAME})` : ''}`)
