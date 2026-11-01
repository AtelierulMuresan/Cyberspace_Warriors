# Neon Static: Build 0.6 (Milestone 6, polish, UI and aim trainer)

## Menu (Esc)
Tabs: **Play** (map, squad size, length, difficulty), **Aim trainer**, **Settings**, **Crosshair** and **Controls**. The last tab you opened is remembered.
- **Settings:**
  - **Mouse:** sensitivity, ADS sensitivity multiplier, and ADS mode (hold, toggle or off).
  - **Video:** FOV, render scale (50–150%), bloom on/off, rain (heavy, light or off), and show/hide for the FPS counter, shot stats and speed meter.
  - **Audio:** master, ambience and interface volume.
- **Crosshair:** length, thickness, gap, centre dot, outline, dynamic (opens with inaccuracy) or static, and colour, with a live preview. There are four presets (Classic, Tight, Dot, Wide). Share codes look like `NS1-…`: copy yours, or paste a friend's and apply it.

## Aim trainer
In the Aim trainer tab, load a drill, then press Deploy. You stand on the firing line with a Lancer and unlimited ammo. Press **Enter** to restart when a drill ends. Best scores are saved in this browser.
- **Gridshot (60 s):** three targets on a 5 × 4 grid, 100 points per hit. Accuracy is shown separately.
- **Flick (60 s):** one small target anywhere in a wide arc. Faster hits score more, and the average reaction time is shown.
- **Tracking (45 s):** keep the crosshair on a target that strafes like a player. The score is the % of time on target.

## Feel and feedback
- **Audio:**
  - Each weapon has its own shot sound, with a short street echo.
  - An ambient soundscape plays rain, a low city hum and distant sirens.
  - Near-misses whizz past your head, panned to the side the bullet passed on.
  - Headshots on a helmet ping, and there are UI sounds for buying, failing to buy and switching weapons.
- **Visual:**
  - Spent casings eject from your gun; the shotgun and Mantis eject on the pump or bolt.
  - Impacts throw debris chips.
  - The camera dips on landing and shakes from explosions, EMPs and incoming hits.
- **Kill feed:** shows the weapon and a ◆ for headshots, coloured by squad.
- **Death report:** who hit you this round, for how much, and what you dealt back.
- **Match summary:** the scoreboard stays up at match end with the MVP, kills, deaths, ADR (average damage per round), headshot % and credits. Tab shows the same table during play.

A cel-shaded cyberpunk tactical shooter built with Three.js.

## Run
Double-click **Play.bat**. It starts `serve.py` (a local server that disables browser caching) and opens http://localhost:8080.
Opening `index.html` directly won't work, because browsers block ES modules on `file://`.
The first load needs internet access to fetch Three.js r160 from jsDelivr.

## Match (Rainline Market)
Two squads of up to 5, you plus bot teammates against a bot squad. Squad size, bot difficulty and match length are in Settings.
- **Sides:** attackers play as **Ghostwire** (magenta) and carry the spike. Defenders play as **Helix** (blue). Sides swap at halftime.
- **Round flow:**
  1. A 12 s buy phase with everyone frozen.
  2. A 1:45 round. Attackers plant at A or B by holding **E** for 3.2 s.
  3. The spike goes off 40 s after the plant. Defenders purge it by holding **E** next to it for 7 s.
- **Win conditions:**
  - **Attackers win** by eliminating every defender or detonating the spike.
  - **Defenders win** by eliminating every attacker before a plant, running out the clock, or purging the spike.
- **Match length:** short is first to 5 with the swap after 4 rounds. Full is first to 13 with the swap after 12.
- **Economy:**
  - Everyone starts with 800 credits and the VOX-9 pistol.
  - Wins pay 3250–3500. Losses pay 1400, rising by 500 per loss in a row up to 3400. Kills pay 300.
  - Planting pays the planter 300, and the attackers get 800 if they lose after planting.
  - Dying loses your rifle and armour. Credits are capped at 16 000.
- **Buy menu:** press **B** in spawn, during the buy phase or the first 20 s. Number keys buy. Buying a new primary drops your old one at your feet.

## Arsenal
Slots: **1** primary · **2** VOX-9 pistol · **3** Monowire knife · **4** throwables (press again to cycle).
**F** picks up or swaps a weapon on the ground. **G** drops your primary for a teammate. Dead players drop their primary, and walking over a gun with no primary picks it up.

| Key | Weapon | Price | Notes |
|---|---|---|---|
| — | **VOX-9** pistol | free | Semi-auto, 12 rounds, 30 damage. One-taps a head without a helmet. |
| 1 | **Razor SMG** | 1250 | 857 rpm, 26 damage, steep falloff. Accurate on the move. Kills pay 600. |
| 2 | **Breaker-12** shotgun | 1050 | 9 pellets × 22, pump action. Lethal up close, useless far away. Kills pay 900. |
| 3 | **K-77 Lancer** rifle | 2700 | 600 rpm, 36 damage, learnable 30-shot spray. |
| 4 | **Mantis DMR** | 4750 | 4× scope, 110 damage. One-shots the chest through armour. Wild unscoped. The bolt drops the scope after each shot. 85% move speed. |
| — | **Monowire** knife | free | LMB slash 35, RMB stab 65. From behind ×2.6, so a stab always kills. 108% move speed. Kills pay 1500. |
| 5 / 6 | Vest / vest + helmet | 650 / 1000 | A helmet protects the head. Armour passes 60–97% of damage depending on the gun. |

## Throwables
Carry up to 4 (2 EMPs, 1 of each other kind). **LMB** throws far, **RMB** lobs short. Throwables bounce off walls.

| Key | Throwable | Price | Effect |
|---|---|---|---|
| 7 | **EMP grenade** | 300 | Airburst after 1.6 s. Blinds enemies who can see it for 0.6–3.2 s, longest when they look straight at it. Bots stop seeing and shooting while blinded. |
| 8 | **Smoke drone** | 300 | Deploys when it lands: a 4.6 m cel-shaded cloud for 15 s. Blocks sight for everyone and puts out fires. |
| 9 | **Incendiary** | 500 | Bursts on landing into a 3.6 m fire for 7 s. 34 damage per second to enemies, ignoring armour. Bots step out of it. |
| 0 | **Holo-decoy** | 200 | A flickering hologram that fakes gunfire for 9 s. It shows on the enemy radar, and enemy bots hunt and shoot it. |

EMPs and fire only affect the thrower's enemies. The radar shows active smokes and fires.

## Bots and the arsenal
- **Buying:**
  - Bots buy the Lancer when they can also afford armour. Normal and hard bots sometimes buy the Mantis when rich.
  - On a mid budget they force-buy an SMG or shotgun.
  - Leftover credits go on throwables: attackers prefer smoke, defenders prefer fire.
- **Utility use:**
  - Attackers smoke the defenders' entrance (or pop an EMP over the site) as they enter.
  - Defenders throw fire or an EMP at attackers spotted at range.
  - Post-plant attackers throw fire on anyone purging the spike.
- **Fighting:** bots with the Mantis scope in when still and wait for a steady aim. Shotguns and the Mantis fire single shots, and SMGs spray up close.
- **When you die:** you watch your teammates first-person until the next round, seeing their gun, HP and ammo. Click to switch between them. If your whole squad is down, you can watch anyone still alive.
- **HUD:**
  - Score bar with each squad's side and alive pips.
  - The round clock, which shows **SPIKE** once it's planted.
  - Your credits, and a plant/purge progress bar.
  - **Tab** for the scoreboard.
  - The radar shows teammates, enemies your team has spotted or heard firing, and the spike.

### Bot squads
- **Attackers:** each round they pick a site and split across its two lanes:
  - A: A Long, or Mid → Catwalk.
  - B: B Tunnel, or Mid → Alley.

  The carrier plants. The rest take post-plant spots watching the defenders' entrance. If the carrier dies, the nearest bot picks up the spike.
- **Defenders:**
  - They hold posts on A, B and Mid.
  - When one spots attackers near a site, the nearest spare defender rotates in. The mid post stays.
  - After a plant they retake: the closest bot purges and the others cover it.
  - Defenders hold their angle rather than chase, and react faster when pre-aimed.
- **Economy:** bots buy a rifle when they can also afford armour, and save otherwise.
- **Balance (measured, bot-only):** attackers win about 65% of rounds. Fights between two bots are even. Attackers win by trading 2-for-1 when they hit a site together. All tuning is in `src/config.js`.

## Practice (Test Range 07)
No match: mannequins, the strafe yard and jump boxes. You hold the Lancer (1) and the VOX-9 (2).

## Files
| File | Role |
|---|---|
| `src/config.js` | All tuning: movement, weapons, bot skill, round timings, economy, shop |
| `src/match.js` | Rounds, spike, economy, damage, kills, halftime, buying, radar and scoreboard data |
| `src/bots.js` | Squad bot: tasks (route, goto, hold, plant/purge), combat (engage, seek, cover) |
| `src/human.js` | The player as a combatant: hitboxes, weapon slots, throwables, pickups |
| `src/aimtrainer.js`, `src/maps/aimlab.js` | Aim trainer drills, scoring and best scores; the aim lab room |
| `src/menu.js` | Menu tabs, crosshair editor (presets, share codes), drill list |
| `src/utility.js` | Throwables: bounce physics, EMP, smoke (blocks sight), fire, holo-decoys |
| `src/player.js` | 64 Hz Source-style movement: friction, air strafing, crouch-jump, step-up, AABB collision |
| `src/weapon.js` | Fire rate, semi/full-auto, pellets, melee, throws, spray pattern, inaccuracy, scope, viewmodels for every model |
| `src/navgrid.js` | Walkable grid from collision boxes, A* pathfinding, corner-safe path smoothing |
| `src/targets.js` | Practice mannequins and their movers |
| `src/maps/market.js` | Rainline Market: layout, callouts, sites, spawns, attack routes, defender posts |
| `src/maps/range.js`, `builder.js`, `index.js` | Practice range, map toolkit, map registry |
| `src/render.js`, `fx.js`, `audio.js`, `hud.js`, `input.js` | Toon rendering, effects, synthesised sounds, HUD, input |
| `serve.py`, `Play.bat` | No-cache local server and launcher |

## Aim down sights
Use right mouse. In Settings → Aim down sights, choose **Hold**, **Toggle**, or **Off** for hip-fire only like classic CS.
- **Zoom:** 1.4× on the Lancer through an open holo sight with a centre dot, and 1.15× on the VOX-9 using its front sight. The crosshair hides while you aim.
- **Accuracy:** the standing and crouching cone tightens by 45%. Moving and jumping stay inaccurate, so counter-strafing still matters.
- **Speed:** you move at 60% speed, and the sights take 0.15 s to come up.
- **Sensitivity** scales with zoom, so aim feels the same zoomed or not.
- **Cancelled by:** reloading, switching weapons, the buy menu, or the buy-phase freeze.

Tuning lives in `adsZoom` per weapon, and in `MOVE.adsSpeed` and `MOVE.adsTime`, in `src/config.js`.

## Shooting mechanics
- **Damage:** Lancer 36, VOX-9 30. Head ×4, chest ×1, legs ×0.75. Falloff per 10 m is 1.5% for the Lancer and 3% for the VOX-9.
- **Accuracy:** full accuracy only below 34% of run speed (the amber tick on the speed bar). Jumping adds heavy spread.
- **Counter-strafing:** stops you in about 47 ms, against about 170 ms when you only release the key.
- **Spray:**
  - The Lancer has a fixed 30-shot pattern: it climbs, drifts left, swings right, then settles left.
  - The camera shows 45% of the kick, so pull down to keep bullets on the crosshair.
