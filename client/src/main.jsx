import '@fontsource/fredoka-one/latin-400.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import App from './App.jsx'
import { installAudioUnlock, sfx } from './audio/sfx'
import BloxityProvider from './bloxity/BloxityProvider.jsx'
import FpsMeter from './bloxity/FpsMeter.jsx'
import { GAME_SLUG } from './bloxity/identity'
import { installDebugHooks } from './debug'
import './index.css'

performance.mark('ff:main')
installDebugHooks()
// Audio starts on the first tap or key press (browsers block it before that).
installAudioUnlock()
// Every chunky button clicks.
window.addEventListener('pointerdown', (e) => {
  if (e.target instanceof Element && e.target.closest('.ff-btn, .ff-iconbtn, .ff-action')) sfx.click()
})

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BloxityProvider gameSlug={GAME_SLUG}>
      <App />
      <FpsMeter />
    </BloxityProvider>
  </StrictMode>,
)
