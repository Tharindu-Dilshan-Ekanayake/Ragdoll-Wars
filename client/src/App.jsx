import { lazy, Suspense } from 'react'

import Lobby from './lobby/Lobby'
import { useApp } from './store/app'
import LoadingScreen from './ui/LoadingScreen'

// The Sea Fort (the lobby) loads first. The battle - its simulation, effects and HUD - is
// its own chunk, fetched quietly while you walk around the camp.
const Battle = lazy(() => import('./battle/Battle.jsx'))

function App() {
  const screen = useApp((s) => s.screen)
  const mapId = useApp((s) => s.mapId)
  const mode = useApp((s) => s.mode)
  const toLobby = useApp((s) => s.toLobby)

  return (
    <div className="ff-app">
      {screen === 'lobby' && <Lobby />}
      {screen === 'battle' && (
        <Suspense fallback={<LoadingScreen label="Marching to the front…" />}>
          <Battle mapId={mapId} mode={mode} onExit={toLobby} />
        </Suspense>
      )}
    </div>
  )
}

export default App
