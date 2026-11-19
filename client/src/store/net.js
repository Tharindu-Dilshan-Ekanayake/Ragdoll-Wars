import { create } from 'zustand'

/**
 * Multiplayer status for the UI: where the connection is, the room we're in and who's
 * in it. Written by net/battleNet.js from network events (never from a frame loop).
 */
export const useNet = create(() => ({
  /** 'idle' | 'connecting' | 'online' | 'error' */
  status: 'idle',
  message: '',
  /** Room info from the server's welcome. */
  code: null,
  mode: 'sandbox',
  mapId: 'training',
  sessionId: null,
  /** [{ sid, name, team, host, avatar: { e: equipped ids, p: proportions } | null }] */
  players: [],
}))

export const getNet = () => useNet.getState()

/** This player's entry in the room (team, host), or null. */
export const me = () => {
  const { players, sessionId } = getNet()
  return players.find((p) => p.sid === sessionId) || null
}
