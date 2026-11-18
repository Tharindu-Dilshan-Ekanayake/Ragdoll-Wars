import GameCanvas from '../battle/render/GameCanvas'
import MapView from '../battle/render/MapView'
import Arrival from './Arrival'
import { BASE_CAMP } from './baseCamp'
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

/** Base Camp in 3D: the camp, its live props, the helipad and your ride in, you, and the camera. */
export default function LobbyScene({ onReady }) {
  return (
    <GameCanvas clearColor={BASE_CAMP.fog} fogColor={BASE_CAMP.fog} fogRange={BASE_CAMP.fogRange} cameraFov={60} onReady={onReady}>
      <MapView map={BASE_CAMP} focus={lobbyFocus} />
      <LobbyProps />
      <Arrival />
      <LobbyPlayer />
      <FollowCamera />
    </GameCanvas>
  )
}
