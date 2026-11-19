# Balance sheet — Drugs Survival

Values from `main` at `a6e9ccd`. Distances are **world units**, not meters: **one map tile = 48**, a sedan is about **71** long, the player box is **32**. Times are in **seconds**. Speeds are **units per second**.

**How to tune:** change **one** number at a time, by about **25–50%**. Save the file. In the browser, press **Ctrl+F5** so the old script is not cached. Play for a minute before you change another number.

**Tune these first**

1. `PLAYER_SPEED` — walk, jog, sprint and cop chase speed all follow this.
2. `COP_SPEED` — how hard it is to outrun the police on foot.
3. `WANTED_DECAY_DELAY` — how long you must hide before a star drops.
4. `COP_SIGHT` — how far away a cop still blocks that star drop.
5. `PISTOL_DAMAGE` and `PISTOL_RANGE` — how deadly and how long the gun is.
6. `WEED_BUY_PRICE`, `WEED_SELL_MIN`, `WEED_SELL_MAX` — how fast you make money.
7. `REGEN_DELAY`, `REGEN_MAX`, `REGEN_PER_SECOND` — how much health comes back after you hide.
8. `COP_DAMAGE` — how fast a cop's punches wear you down.

---

## World

| Name | Value | File | What it does |
|---|---|---|---|
| TILE | 48 | js/constants.js | Size of one map tile. Many ranges are written as a multiple of this. |
| PLAYER_SIZE | 32 | js/constants.js | The player's collision box. Building bumping uses half of this (16). |

---

## Player health, HIGH, regen, death

All in `js/player-health.js`. Health and HIGH are 0–100. After death you wait, then respawn at the spawn point with full health, HIGH cleared, stars cleared, all weed gone, and a quarter of your cash lost (`DEATH_CASH_LOSS`).

There is **no in-game way to gain HIGH yet**. Only the debug key **F10** (and `dsDebug.high()`) add it.

| Name | Value | File | What it does |
|---|---|---|---|
| PLAYER_MAX_HEALTH | 100 | js/player-health.js | Highest health the player can have. |
| PLAYER_START_HEALTH | 100 | js/player-health.js | Health at spawn and after a respawn. |
| PLAYER_MAX_HIGH | 100 | js/player-health.js | Highest HIGH the player can have. |
| PLAYER_START_HIGH | 0 | js/player-health.js | HIGH at spawn and after a respawn. |
| PUNCH_PLAYER_DAMAGE | 5 | js/player-health.js | Intended punch damage *to the player*. **Not used** by cops (they use `COP_DAMAGE`). |
| BAT_PLAYER_DAMAGE | 15 | js/player-health.js | Intended bat damage to the player. **Not used** by anyone on main yet. |
| BOTTLE_PLAYER_DAMAGE | 15 | js/player-health.js | Intended bottle damage to the player. **Not used** by anyone on main yet. |
| PISTOL_PLAYER_DAMAGE | 20 | js/player-health.js | Intended pistol damage to the player. Only used as the default for the debug hurt key. |
| CAR_HIT_MIN_SPEED | 40 | js/player-health.js | A car slower than this (units/s) only shoves the player; it deals no damage. Same floor as `RUNOVER_SPEED`. |
| CAR_HIT_MIN_DAMAGE | 10 | js/player-health.js | Health lost when a car just reaches that speed floor. |
| CAR_HIT_MAX_DAMAGE | 40 | js/player-health.js | Health lost when the car is at `CAR_HIT_FULL_SPEED` or faster. In between, damage eases from 10 to 40. |
| CAR_HIT_FULL_SPEED | 160 | js/player-health.js | Speed (units/s) at which a car hit deals the maximum 40 damage. |
| REGEN_DELAY | 8 | js/player-health.js | Seconds without taking damage before health starts to rise again. |
| REGEN_MAX | 30 | js/player-health.js | Health only regenerates up to this, never back to 100. |
| REGEN_PER_SECOND | 5 | js/player-health.js | Health gained per second while regenerating. From 0, that is 6 seconds to reach 30. |
| HIGH_DRAIN_PER_SECOND | 2 | js/player-health.js | HIGH lost per second. A full 100 HIGH would drain in 50 seconds. |
| HIGH_DAMAGE_TAKEN | 0.8 | js/player-health.js | While any HIGH is left, hits on the player are multiplied by this (20% less). Overdose damage is not reduced. |
| HIGH_DAMAGE_DEALT | 1.25 | js/player-health.js | While any HIGH is left, the player's punches, bat, bottle and pistol hit 25% harder. |
| OVERDOSE_HIGH | 80 | js/player-health.js | Above this HIGH, health also starts to drain. |
| OVERDOSE_HP_PER_SECOND | 3 | js/player-health.js | Health lost per second while HIGH is above 80. |
| DEATH_RESPAWN_DELAY | 2 | js/player-health.js | Seconds of no control after health reaches 0, then you respawn. |
| DEBUG_HIGH_AMOUNT | 30 | js/player-health.js | How much HIGH F10 / `dsDebug.high()` adds each time. |

---

## Weapons (your attacks)

Damage numbers to *people* live in `js/pistol.js` (even for the bat and bottle). A pedestrian has 2 HP, so a punch leaves them up and a second punch (or one bat, bottle, or pistol shot) drops them. While you have HIGH, those amounts are multiplied by `HIGH_DAMAGE_DEALT`.

| Name | Value | File | What it does |
|---|---|---|---|
| PUNCH_DAMAGE | 1 | js/pistol.js | Damage of one fist hit to a person. |
| BAT_DAMAGE | 2 | js/pistol.js | Damage of one bat hit to a person (one-hit knockout). |
| BOTTLE_DAMAGE | 2 | js/pistol.js | Damage of a thrown bottle to a person (one-hit knockout). |
| PISTOL_DAMAGE | 2 | js/pistol.js | Damage of one pistol shot to a person (one-hit knockout). |
| PUNCH_REACH | 36 | js/punch.js | How far a punch can reach, from the player's centre (a bit under one tile). |
| PUNCH_SIDE | 14 | js/punch.js | How wide the punch hit box is. A person beside or behind you is missed. |
| JAB_HIT | 0.208 | js/punch.js | Seconds into the jab clip when the punch actually lands. |
| CROSS_HIT | 0.292 | js/punch.js | Seconds into the cross clip when the punch actually lands. |
| JAB_POSE | 0.833 | js/punch.js | How long the jab pose lasts, in seconds, before you can punch again. |
| CROSS_POSE | 1 | js/punch.js | How long the cross pose lasts, in seconds. |
| BAT_REACH | 48 | js/bat.js | How far a bat swing can reach (one tile). |
| BAT_SIDE | 18 | js/bat.js | How wide the bat hit box is. |
| BAT_HIT | 0.5 | js/bat.js | Seconds into the swing when the bat actually lands. |
| BAT_SWING | 1.5 | js/bat.js | Length of the whole bat swing, in seconds. |
| THROW_REACH | 144 | js/bottle.js | How far a bottle flies along the ground (three tiles). |
| MIN_REACH | 18 | js/bottle.js | Shortest throw; closer than this the bottle still leaves the hand at this distance. |
| GRAVITY | -180 | js/bottle.js | Downward pull on a thrown bottle, in units per second squared. |
| RELEASE | 0.375 | js/bottle.js | Seconds into the throw pose when the bottle leaves the hand. |
| MAG | 12 | js/pistol.js | Shots in one magazine. After 12 you must reload. |
| SHOT_TIME | 0.2 | js/pistol.js | Seconds between pistol shots (5 shots per second if you hold fire). |
| PISTOL_RANGE | 288 | js/pistol.js | How far a bullet can hit a person or mark a car (six tiles). |
| RELOAD_TIME | 1.67 | js/pistol.js | Seconds a reload takes. |
| SHOT_POSE | 0.4 | js/pistol.js | Seconds the recoil pose lasts. |
| AIM_TAU | 0.08 | js/pistol.js | How quickly aim turns to follow the cursor, in seconds (smaller is snappier). |
| PED_REACH | 16 | js/pistol.js | Extra hit radius around a person when a shot is tested, so a near miss can still count. |

---

## Cars (HP, crashes, smoke, fire)

A wreck also hurts people in `BLAST_RADIUS` for `BLAST_DAMAGE` (same as a bat or pistol). Crash damage only applies to the car *you* are driving: damage = (speed lost − `CRASH_MIN_SPEED`) × `CRASH_DAMAGE_SCALE`. Example: losing 100 speed deals `(100 − 60) * 0.25` = 10 HP.

| Name | Value | File | What it does |
|---|---|---|---|
| CAR_HP | 100 | js/car-damage.js | Starting hit points for every car, including parked and driven ones. |
| PISTOL_CAR_DAMAGE | 5 | js/car-damage.js | Pistol damage to a car. 20 shots wreck a 100 HP car; smoke starts at shot 12, fire at 16. |
| BAT_CAR_DAMAGE | 5 | js/car-damage.js | Bat damage to a car. |
| BOTTLE_CAR_DAMAGE | 2 | js/car-damage.js | Thrown-bottle damage to a car. |
| CRASH_MIN_SPEED | 60 | js/car-damage.js | A crash only damages your car if the sudden speed loss is greater than this (units/s). |
| CRASH_DAMAGE_SCALE | 0.25 | js/car-damage.js | Car HP lost per unit/s of speed loss above that floor. |
| SMOKE_HP | 40 | js/car-damage.js | When remaining HP is at or below this, the car starts smoking. |
| FIRE_HP | 20 | js/car-damage.js | When remaining HP is at or below this, the car catches fire. |
| WRECK_LIFE | 30 | js/car-damage.js | Seconds a wreck stays in the world before it is removed. |
| WRECK_DESPAWN | 1120 | js/car-damage.js | A wreck is also removed if the player is this far away (units). |
| BLAST_RADIUS | 60 | js/car-damage.js | How far an exploding wreck hurts people (a bit more than one tile). |
| BLAST_DAMAGE | 2 | js/car-damage.js | Damage an explosion deals to a person in that radius (one-hit knockout). |
| PED_RADIUS | 8 | js/car-strike.js | How fat a person is for car-hit tests, in units. |
| RUNOVER_SPEED | 40 | js/pedestrians.js | A car slower than this (units/s) shoves a pedestrian aside; faster, it knocks them down. |

---

## Economy

Selling to a calm pedestrian in range with **E**. A sale always adds `HEAT_PER_DEAL` to a heat counter, but **stars only go up if a witness is in** `WITNESS_RANGE` (**`WANTED_DEAL_SEEN`**). Nothing else on main reads the heat counter.

| Name | Value | File | What it does |
|---|---|---|---|
| START_CASH | 200 | js/economy.js | Cash you begin a session with. |
| WEED_BUY_PRICE | 20 | js/economy.js | Cash paid for one bag at the supplier. |
| WEED_SELL_MIN | 35 | js/economy.js | Lowest cash you can get for one bag. Each sale picks a whole dollar from 35 to 50. |
| WEED_SELL_MAX | 50 | js/economy.js | Highest cash you can get for one bag. Profit per bag is therefore $15–$30. |
| MAX_STOCK | 10 | js/economy.js | Most bags you can carry. |
| BUYER_COOLDOWN | 30 | js/economy.js | Seconds before the same pedestrian will buy again. |
| DEATH_CASH_LOSS | 0.25 | js/economy.js | Fraction of cash lost on death (rounded down). All stock is lost too. |
| HEAT_PER_DEAL | 0.5 | js/economy.js | Added to `economy.heat` on every sale. **Not used** for stars or the HUD on main. |
| SUPPLIER_X | 4728 + 96 (= 4824) | js/economy.js | World X of the supplier (two tiles east of the island spawn centre). |
| SUPPLIER_Z | 9720 − 96 (= 9624) | js/economy.js | World Z of the supplier (two tiles north of the island spawn centre). |
| SUPPLIER_RANGE | 48 | js/economy.js | How close you must stand to the supplier to buy (one tile). |
| SELL_RANGE | 44 | js/economy.js | How close a pedestrian must be for you to sell (a little longer than a punch). |

---

## Wanted level

Stars go from 0 to 5. A kill replaces the hit (it is not added on top). Decay only runs when **no living cop** is within `COP_SIGHT`.

| Name | Value | File | What it does |
|---|---|---|---|
| MAX_WANTED | 5 | js/wanted.js | Highest wanted level. The HUD shows whole stars, so 1.5 looks like 1 star. |
| WANTED_DEAL_SEEN | 0.5 | js/wanted.js | Stars added when you sell and another pedestrian is within `WITNESS_RANGE`. |
| WANTED_HIT | 1 | js/wanted.js | Stars added for hitting a pedestrian. |
| WANTED_SHOT | 1 | js/wanted.js | Stars added for firing a shot that counts as a crime. |
| WANTED_KILL | 2 | js/wanted.js | Stars added for killing a pedestrian, instead of the hit. |
| WANTED_HIT_COP | 1.5 | js/wanted.js | Stars added for hitting a cop. |
| WANTED_KILL_COP | 3 | js/wanted.js | Stars added for killing a cop, instead of the hit. |
| WITNESS_RANGE | 192 | js/wanted.js | How close a pedestrian must be to witness a deal (four tiles). |
| WANTED_DECAY_DELAY | 20 | js/wanted.js | Quiet seconds with no cop in sight before one whole star drops. |

---

## Police

Cops jog at the player's jog speed, so you can outrun them by sprinting (`PLAYER_SPEED * 1.4`). At 1 star you get 1 cop, up to `MAX_COPS`. They stop punching below `BUST_HEALTH` and arrest you instead.

| Name | Value | File | What it does |
|---|---|---|---|
| COP_SPEED | PLAYER_SPEED * 1.0 (= 84) | js/police.js | Ground speed while chasing, in units/s. Same as your jog. |
| COP_LEAVE_SPEED | PLAYER_SPEED * 0.5 (= 42) | js/police.js | Speed a cop uses when leaving, in units/s. Same as a walk. |
| COP_DAMAGE | 8 | js/police.js | Health a cop punch takes off (not `PUNCH_PLAYER_DAMAGE`). 13 punches to drop you from 100, if you are not high. |
| COP_CHASE_GAIT | "jog" | js/police.js | Animation used while chasing. Keep this matched to `COP_SPEED` or the feet will slide. |
| COP_SIGHT | 288 | js/police.js | If any living cop is within this (six tiles), wanted stars will not decay. |
| COP_PUNCH_COOLDOWN | 1 | js/police.js | Seconds between one cop's punches. |
| MAX_COPS | 4 | js/police.js | Most cops that can be out at once. |
| COPS_PER_STAR | 1 | js/police.js | Cops wanted per whole star, capped by `MAX_COPS`. |
| COP_SPAWN_GAP | 0.6 | js/police.js | Seconds between two cop spawns, so they arrive one by one. |
| COP_REACH | 40 | js/police.js | How close a cop must be to punch or to start a bust (units). |
| COP_HP | 3 | js/police.js | Cop hit points. A fist takes three hits; a bat, bottle or pistol takes two. |
| BUST_TIME | 3 | js/police.js | Seconds a cop must stay in reach, with your health below 30, to arrest you. The timer resets if they lose you. |
| BUST_HEALTH | 30 | js/police.js | Below this health, cops stop punching and try to arrest you instead. |
| BUST_CASH_LOSS | 0.5 | js/police.js | Fraction of cash lost on a bust (rounded down). All stock is lost too. |
| OFFSCREEN_MARGIN | 80 | js/police.js | Extra distance past the visible area where cops spawn and despawn, in units. |

---

## Speeds (player, pedestrians, cops, cars)

Player gaits in `js/player.js` are multipliers of `PLAYER_SPEED`. Pedestrian gaits in `js/pedestrians.js` store the same speeds already multiplied. Both give walk **42**, jog **84**, sprint **117.6**.

The car you drive has **no named top-speed constant**. The arcade code is scaled by `METERS_TO_WORLD` so a typical cruise is about **180** units/s (a bit under four tiles per second). Traffic cruise is slower: `CRUISE_MIN` plus 0–39, so **108–147** units/s.

| Name | Value | File | What it does |
|---|---|---|---|
| PLAYER_SPEED | 80 * 1.05 (= 84) | js/constants.js | Your jog speed, in units/s. Walk is half, sprint is 1.4×. Cops use this too. |
| GAIT_SPEED.walk | 0.5 (= 42 units/s) | js/player.js | Walk multiplier. Pedestrians use `PLAYER_SPEED * 0.5` in js/pedestrians.js. |
| GAIT_SPEED.jog | 1 (= 84 units/s) | js/player.js | Jog multiplier. Pedestrians use `PLAYER_SPEED`. |
| GAIT_SPEED.sprint | 1.4 (= 117.6 units/s) | js/player.js | Sprint multiplier. Pedestrians use `PLAYER_SPEED * 1.4`. |
| SPEED_TAU | 0.16 | js/player.js | How quickly your on-foot speed eases to the new gait, in seconds. |
| TURN_TAU | 0.055 | js/player.js | How quickly you turn to face the move direction, in seconds. |
| STICK_DEAD | 0.28 | js/touch-ui.js | Phone stick must be pushed past this (0–1) before it counts as a move. |
| STICK_JOG | 0.65 | js/touch-ui.js | Phone stick past this becomes a jog; a lighter push stays a walk. |
| METERS_TO_WORLD | 180 / 11 (≈ 16.36) | js/kenney-vehicle.js | Scales the driven-car physics into world units. Raising this makes the car faster. |
| DRIFT_ON | 166 | js/kenney-vehicle.js | Speed (units/s) at which a full steering lock can break traction. |
| DRIFT_OFF | 138 | js/kenney-vehicle.js | Speed (units/s) below which a slide ends and the car grips again. |
| DRIVE_SPOOL | 2.0 | js/kenney-vehicle.js | How quickly a normal car's throttle catches up (higher is snappier). |
| BULKY_SPOOL | 1.05 | js/kenney-vehicle.js | Same for a truck or van: slower spool, so it pulls away later. |
| BULKY_THROTTLE | 1.55 | js/kenney-vehicle.js | How slowly a bulky car answers the throttle (normal cars use 3.2, not a named constant). |
| BULKY_BRAKE | 2.4 | js/kenney-vehicle.js | How slowly a bulky car brakes (normal cars use 4.0, not a named constant). |
| CRUISE_MIN | 108 | js/routes.js | Slowest traffic cruise, in units/s. Each driver rolls 108–147. |
| CORNER_SPEED | 46 | js/routes.js | Speed traffic uses through a corner, in units/s. |
| ACCEL | 90 | js/routes.js | How fast traffic speeds up, in units per second squared. |
| BRAKE | 180 | js/routes.js | How fast traffic and junction stops brake, in units per second squared. |
| STOP_GAP | 34 | js/routes.js | Distance (units) traffic tries to keep when stopped behind another car. |
| SLOW_GAP | 118 | js/routes.js | Distance (units) at which traffic starts to ease off behind a car ahead. |

---

## Traffic flow and signals

| Name | Value | File | What it does |
|---|---|---|---|
| MAX_DRIVERS | 14 | js/routes.js | Most AI cars driving at once (parked cars are separate). |
| SPAWN_MIN | 500 | js/routes.js | Closest a new traffic car may spawn from the player, in units. |
| SPAWN_MAX | 860 | js/routes.js | Farthest a new traffic car may spawn from the player, in units. |
| DESPAWN | 1120 | js/routes.js | Distance at which a traffic car is removed, in units. |
| STUCK_TIME | 2.6 | js/routes.js | Seconds a traffic car may sit stuck before it is removed or reset. |
| TURN_RADIUS | 42 | js/routes.js | How wide a traffic car's cornering arc is, in units. |
| REJOIN_GAP | 12 | js/routes.js | How close to its lane a car you just left must be to drive on as traffic. |
| REJOIN_TURN | 0.6 | js/routes.js | How closely that car must already face along the lane (about 34°) to rejoin. |
| SIGNAL_GREEN | 6 | js/signals.js | Seconds a traffic light stays green on one axis. |
| SIGNAL_YELLOW | 2 | js/signals.js | Seconds of yellow after green. |
| SIGNAL_ALL_RED | 1 | js/signals.js | Seconds both axes stay red before the other axis turns green. A full cycle is 18 seconds. |

---

## Pedestrians

| Name | Value | File | What it does |
|---|---|---|---|
| PED_HP | 2 | js/pedestrians.js | Starting hit points. A fist takes two hits; a bat, pistol, bottle, or a fast car takes one. |
| KILL_DAMAGE | 2 | js/pedestrians.js | Damage used when a hit does not pass its own amount (bat, pistol, bottle, run-over). |
| PANIC_RANGE | 900 | js/pedestrians.js | How far a gunshot scare reaches, in units (almost 19 tiles). |
| PANIC_TIME | 6 | js/pedestrians.js | Seconds those people sprint away after a scare. |
| CROWD | 1200 | js/pedestrians.js | How many pedestrian slots the island keeps in the simulation. |
