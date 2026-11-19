import GameCanvas from '../battle/render/GameCanvas'
import MapView from '../battle/render/MapView'
import Arrival from './Arrival'
import FortDecks from './FortDecks'
import { SEA_FORT } from './seaFort'
import FollowCamera from './FollowCamera'
import LobbyPlayer from './LobbyPlayer'
import LobbyProps from './LobbyProps'
import { lobby } from './lobbyState'

const focus = { tx: 0, tz: 0, dist: 22 }
/** The sun's shadow box follows you around the camp. */
const lobbyFocus = () => {
  focus.tx = lobby.player.x
  focus.tz = lobby.player.z
  return focus
}

/** The Sea Fort in 3D: sea and decks, props, the helipad and your ride in, you, and the camera. */
export default function LobbyScene({ onReady }) {
  return (
    <GameCanvas clearColor={SEA_FORT.fog} fogColor={SEA_FORT.fog} fogRange={SEA_FORT.fogRange} cameraFov={60} onReady={onReady}>
      <MapView map={SEA_FORT} focus={lobbyFocus} />
      <FortDecks />
      <LobbyProps />
      <Arrival />
      <LobbyPlayer />
      <FollowCamera />
    </GameCanvas>
  )
}
