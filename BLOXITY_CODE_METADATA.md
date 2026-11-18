---
canDie: false
hasScore: false
---

# Floppy Front: Boxity integration

A ragdoll army sandbox. The player is a commander, not a soldier: there is no player
character, no death and no score yet. From the menu you deploy onto a battlefield, drop
soldiers for the Blue and Red teams, give orders (Attack / Hold / Flank, or click to move)
and watch the battle play out with ragdoll physics, wounds and bleeding.

## Phase 1 scope (this build)

- One battlefield (Training Grounds), six infantry types, both teams AI-controlled.
- Runs entirely in the browser. **No game server is used yet**: `server/` and `shared/`
  are still the Phone Plunge template and get rebuilt for saves and multiplayer in a
  later phase. The client never connects to them.
- Settings (graphics level, blood on/off, volume) are kept in localStorage.

## Identity

`VITE_GAME_SLUG` (default `floppy-front`) is passed to `Legion.SDK.init()`. Sign-in shows
the player's name on the menu; nothing is saved per account yet.

## Screen ads and lifecycle

`ads.declareScreens({ panel: {}, gameplay: {} })` once after init. The client reports
`gameplayStart` once the menu is up, then `ads.screen('panel')` while a modal panel is
open (settings, help, confirmations) and `ads.screen('gameplay')` otherwise. Gameplay
banners are **off** (no `show: true`).

## Ad breaks

`ads.onBreakStart` stops the canvas from drawing (R3F `frameloop: 'never'`), which also
freezes the battle, and mutes audio until `ads.onBreakEnd`.

## Portal settings

`master_volume`, `music_volume` (the ambient wind), `graphics_quality` (never raises an
auto-detected LOW device on the initial default), `show_fps`, `camera_sensitivity`,
`background_transparency`, `fullscreen`.

## Not used yet

Leaderboards, chat bubbles, emotes, rewarded ads, Gems purchases and Open Rooms. They
come back with the features that need them (saves and multiplayer).
