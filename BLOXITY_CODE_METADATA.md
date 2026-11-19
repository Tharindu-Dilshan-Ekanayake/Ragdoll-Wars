---
canDie: false
hasScore: false
---

# Floppy Front: Boxity integration

A ragdoll army sandbox. The player is a commander: from the Sea Fort lobby you deploy
onto one of ten battlefields, drop soldiers, vehicles and fortifications for the Blue and
Red teams, give orders and watch the battle play out with ragdoll physics - or walk the
field as your own Boxity avatar. Zombie Horde is a 15-wave survival mode; multiplayer
battles (sandbox and co-op Zombie Horde, up to four players) run on the game server.

## What runs where

- Single-player battles run entirely in the browser.
- The game server (`server/`, Colyseus on Bloxity Legion) runs multiplayer battles with
  the game's own simulation, and keeps cloud saves and leaderboards (below).
- Settings (graphics level, blood on/off, volume) are kept in localStorage.

## Identity

`VITE_GAME_SLUG` (default `floppy-front`) is passed to `Legion.SDK.init()`. A signed-in
player's token goes with every server join and is verified there; their Boxity name is
shown to other players and on the leaderboards.

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

## Cloud saves

Signed-in players' progress (Zombie Horde best wave and star badges, the leaderboard
totals) and their sandbox saves are kept by the game server, not the SDK: the client
opens a short-lived Colyseus `profile` room (`server/src/rooms/ProfileRoom.js`) with
its Boxity token, which the server checks with `/v1/auth/game-token/verify`. Profiles
live in the managed MongoDB (`MONGODB_URI`), or a SQLite file off hosting. Merging
never loses progress (`client/src/shared/profile.js`). Guests keep everything in
localStorage, as before.

## Leaderboards

Four boards, declared with `leaderboard.define()` at init: `zombie_wave` (Best Zombie
Wave), `zombie_kills` (Zombies Dropped), `battles` (Battles Fought), `playtime`
(Minutes Played), all `best` mode. Scores come from the cloud profile: the server
reports them (`/v1/leaderboards/hosted/{gameId}/report`, `BLOXITY_REPORT_TOKEN`) and
the client also submits them through the SDK for signed-in players. The lobby's
trophy button shows the game's own top-10 from the server's database.

## Not used yet

Chat bubbles, rewarded ads and Gems purchases.
