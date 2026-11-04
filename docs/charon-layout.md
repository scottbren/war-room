# CHARON layout (map version 12: zigzag of three bars; sections below the Version 6 note describe v5 and earlier and are superseded where they conflict)

`content/maps/charon.json` implements this document. All rooms are axis-aligned rectangles, `[minX, minY] – [maxX, maxY]` in meters, in **map coordinates**. North is +y. The sea is to the south (y < 0). Non-rectangular buildings are composed from several rectangles (U, L and stepped shapes); the map format has no polygon rooms.

Version 4 removed the external emergency stair (it spoiled the front) and added a columned porte-cochere (`g.portico`, in front of the main door, which now opens into it), a forecourt fountain, colonnades, a domed belvedere (`grounds.belvedere`) on the garden axis, a reflecting pool, parterre beds, a balustraded upper terrace, an infinity pool with a cabana (`grounds.cabana`) and a covered dock lounge (`grounds.dock-lounge`). Version 3 added the fortress roof, the security operations center, windows, extra entries, the pool house and a smart-home layer (see `docs/decisions.md`, 2026-11-03). Version 2 replaced the original single rectangular block (see `docs/decisions.md`). Everything gameplay depends on is unchanged: the approach points, gate, helipad, marina, the panic room / shaft / tunnel roles, family rooms upstairs, the guard counts, and the reaction force in the guest villa.

## Compound (floor `grounds`, z = 0)
| Id | What | Rect | Notes |
| --- | --- | --- | --- |
| grounds.estate | Walled estate | [0,0] – [100,80] | Perimeter wall on west, north, east (material `perimeter`, 3 m high, 0.6 m thick); hand-authored `w.fixed.*` walls, with a 6 m gap for the gate and a 2 m gap for the staff gate (`d.staff-gate`, west wall at (0,64), kind `gate`, locked) |
| grounds.cliff | Seawall and cliff edge | along y = 0, x 0–100 | 6 m drop to the beach; `cliff-path` link at x 18 for divers (approach E) |
| grounds.highway | Coastal highway (outside) | [-20,84] – [120,94] | Zone `road` |
| grounds.gate | Main gate | door at (69,80), width 6, kind `gate` | Approach A. Joins outside to outside (it sits in the perimeter wall, not between rooms) |
| grounds.guardhouse | Gate guardhouse | [72,76] – [76,80] | Outer-ring guard post |
| grounds.gate-lodge | Gate lodge | [62,76] – [66,80] | Mirrors the guardhouse on the other side of the gate |
| grounds.guest-villa (+ .wing) | Guest villa, **L-shaped** (reaction force) | [74,60] – [94,68] and wing [84,68] – [94,74] | 8 reaction-force posts |
| grounds.garage | Garage with armored SUVs | [74,52] – [94,60] | SUVs are heavy cover |
| grounds.staff (+ .wing) | Staff quarters, **L-shaped** | [6,60] – [24,68] and wing [6,68] – [14,74] | Civilian staff spawn |
| grounds.pool-house | Pool house | [74,4] – [88,12] | Door north at (80,12); outdoor kitchen on the lawn side (grill island, bar; terrace zone [74,12.2]–[90,15]) |
| grounds.power-house | Power house | [4,8] – [12,14] | Locked door at (8,14). Holds the backup smart-home hub |
| grounds.helipad | Helipad | [40,60] – [56,76] | `lz` marker; approach C |
| grounds.drive | Driveway | zones [66,56] – [72,80] and [50,56] – [72,60] | Zone `exposed` |
| grounds.house | Main residence | [28,16] – [72,56] | A U: main block north, wings south, open courtyard (below) |
| grounds.terrace | Terrace along the south front | [28,10] – [72,16] | Zone `terrace`; six planters along y = 16 are light cover |
| grounds.lawn | Lawn | three zones: [0,0] – [28,16], [72,0] – [100,16], [28,0] – [72,10] | Zone `lawn` |
| grounds.garden-east | Formal garden | [72,16] – [96,50] | Zone `garden`. Gravel paths cross at a fountain plaza ([80,29]–[88,37]); three quadrants hold C-shaped hedge rooms (concealment, open toward the path) with topiary at the plaza corners and palms along the main path; the fourth holds a columned gazebo with a bench. Gravel paths and the plaza are `terrace` zones |
| grounds.trees-west | Grove | [4,20] – [28,50] | Zone `garden`. Eighteen trees in staggered rows (concealment), a gravel path down the middle (x 14–16.4), and an ornamental pond with a bench at [6,38]–[12,44] |
| grounds.marina | Marina and dock | [78,-12] – [100,0] | Zone `marina`; approach D at the dock (88,-2) |
| grounds.boathouse (+ .store) | Boathouse, **L-shaped** (tunnel exit) | [80,-4] – [90,2] and store [76,-4] – [80,0] | Tunnel exit point (85,0) |
| grounds.yacht (+ .bow) | His armed yacht, with a **stepped bow** | [84,-12] – [94,-6] and bow [94,-10] – [98,-8] | Escape option; can be disabled |
| grounds.sea | Black Sea | [-20,-40] – [120,0] | Zone `sea`; boat approach |

Approach markers: A gate (69,81); B west wall breach (0,40); C helipad (48,68) or fast-rope onto the south balcony (67,14.5); D dock (88,-2); E cliff path (18,0).

Neighboring villas (outside the walls, collateral risk), each **L-shaped**: west [-40,20] – [-10,50] plus wing [-30,50] – [-10,60]; east [110,20] – [140,50] plus wing [110,50] – [130,60].

## The house: a courtyard villa
The house footprint is x 28–72, y 16–56 (44 x 40 m). The main block (y 38–56) stands to the north; two wings (y 16–38) run south either side of a pool courtyard (x 42–58) that opens to the terrace and the sea. Each wing has a loggia (a covered arcade) along the courtyard, open to it and lined with columns.

```
 N (gate / drive / helipad)
 +----------------------------------------------+ y=56
 | Library | Cloak | Foyer | Security | Dining   |
 +---------+-------+-------+----------+          |
 | Drawing |     GRAND HALL (8 m)     | Kitchen  | y=38
 +---------+--+--------------------+--+----------+
 | Master  |LW|     courtyard      |LE| Panic    |
 |  suite  |  |     pool, fountain |  |  room    |
 +---------+  |                    |  +----------+
 | Study   |  |                    |  | Generator|
 |         |  |                    |  | Pantry   | y=16
 +---------+--+   (open to sea)  --+--+----------+
 S (terrace, lawn, sea)        LW/LE = west/east loggia
```

## Ground floor (floor `ground`, z = 0)
| Id | Room | Rect | Notes |
| --- | --- | --- | --- |
| g.foyer | Entrance foyer | [46,52] – [54,56] | Main doors at (50,56), approach A side |
| g.cloak | Cloakroom and powder room | [38,52] – [46,56] | Off the foyer |
| g.security | Guard room | [54,52] – [62,56] | Front-door guard post with an armory rack (heavy cover) and two slit windows |
| g.grand-hall | Grand hall | [38,38] – [62,52] | Double height (ceiling 8). Piano (light cover). **Twin grand staircases**: two walkable marble flights, 3 m wide and 9.2 m long, run up the west and east walls from y = 41 and rise 4 m to the gallery (x = 40 and x = 60). A balustrade rail (light cover) lines each flight's open edge. The flights are drawn as real steps from the `stairs` links, not as solid blocks. Glass doors to the courtyard at (50,38) |
| g.library | Library | [28,46] – [38,53] | Built-in shelves along the west wall, reading table |
| g.wine-room | Wine room and humidor | [28,53] – [38,56] | Off the library; racks; two slit windows |
| g.drawing | Drawing room | [28,38] – [38,46] | Sofas: light cover |
| g.dining | Formal dining room | [62,46] – [72,56] | Long table: light cover |
| g.kitchen | Kitchen | [62,38] – [72,46] | Island: heavy cover |
| g.master | Master suite | [28,16] – [38,28] | West wing; glass door to the terrace at (33,16). Principal option |
| g.study | Study | [28,28] – [38,38] | Desk: heavy cover. Possible drive location. Principal option |
| g.loggia.w | West loggia | [38,16] – [42,38] | Arcade; five columns along its courtyard edge |
| g.courtyard | Pool courtyard | [42,16] – [58,38] | Open air (tag `exterior`). Pool, fountain, four loungers. A low glass balustrade closes its south edge, with an 8 m gap at (50,16) |
| g.loggia.e | East loggia | [58,16] – [62,38] | Arcade; five columns; service stairs at (60,30) |
| g.panic | Panic room | [62,16] – [72,28] | East wing. Reinforced walls, not destructible; blast door on the loggia at (62,22); floor hatch to the tunnel at (66,18); shaft up at (70,26) |
| g.soc | Security operations center | [62,28] – [72,33] | Tags `security-center`, `smart-hub`. Shares the panic room's north wall. Locked door to the east loggia at (62,30.5). Monitor console and server racks (heavy cover); two slit windows. The smart-home hub is here |
| g.service | Generator, pantry and staff entrance | [62,33] – [72,38] | Backup power (target for the power cut). Staff entrance: locked exterior door at (72,35.5); connects to the kitchen at (67,38) |
| g.garage-link | Covered garage walkway | [72,52] – [74,56] | Tag `walkway`. Door from the dining room at (72,54), locked door to the garage side at (74,54) |

Rooms tagged `hall` (grand hall, both loggias, the gallery and the upper galleries) are the circulation spaces; the panic room's door opens to one of them. Interior walls are `plaster`; exterior walls `reinforced`; panic room and safe landing walls `reinforced` and not destructible. Glass doors (kind `glass`) face the terrace from the master suite and the courtyard from the grand hall. Windows: about 37, all blast-rated. Armored glass windows (1.8 m, steel shutter) light the bedrooms, library, drawing room and dining room; narrow slit windows (0.4 m, no shutter) guard the wine room, the guard room, the SOC, the bath and the roof bastions. The panic room and the safe landing have none. Shutters are **open by default** and are meant to close as the target's alert level rises; that is runtime state and is not in the sim yet (see decisions).

## Upper floor (floor `upper`, z = 4)
| Id | Room | Rect | Notes |
| --- | --- | --- | --- |
| u.void | Grand hall void | [38,38] – [62,50] | Open to the ground floor (`gallery-void` opening) |
| u.gallery | Gallery walkway | [38,50] – [62,52] | Where both grand staircases arrive; glass railing along the void. Doors to the office, lounge, son's room and wife's suite |
| u.office | Private office | [38,52] – [50,56] | Safe: possible second drive |
| u.cinema | Screening room | [50,52] – [62,56] | Cinema seating (light cover) |
| u.son | Son's room | [28,46] – [38,56] | Tag `family`; glass door to the north balcony |
| u.guest | Guest suite | [28,38] – [38,46] | West wing |
| u.spa | Spa and sauna | [28,28] – [38,38] | |
| u.gym | Gym | [28,16] – [38,28] | Rack (heavy cover) |
| u.loggia.w | West gallery | [38,16] – [42,38] | Railing onto the open courtyard |
| u.court-void | Courtyard void | [42,16] – [58,38] | Open air above the courtyard (`gallery-void` opening) |
| u.loggia.e | East gallery | [58,16] – [62,38] | Service stairs down at (60,30); roof hatch at (60,24) |
| u.wife | Wife's suite | [62,38] – [72,56] | Tag `family` |
| u.safe | Safe landing | [62,16] – [72,28] | Directly over the panic room. Reinforced; shaft down at (70,26); glass door to the south balcony |
| u.daughter | Daughter's room | [62,28] – [72,34] | Tag `family`; next to the safe landing |
| u.bath | Bathroom | [62,34] – [72,38] | |
| u.balcony.e | South balcony | [62,13] – [72,16] | Exterior; fast-rope point (approach C) |
| u.balcony.n | North balcony | [28,56] – [38,59] | Exterior, off the son's room. The roof ladder (`link.roof-ladder`) climbs from (30,58) |

## Roof: the fortress terrace (floor `roof`, z = 8)
Four corner bastions, a radar tower and four covered walkways are walled structures; the rest are open decks edged by a 1 m parapet of cover (nine strips: the U outline, the courtyard rim, and a gap for the ladder).

| Id | Room | Rect | Notes |
| --- | --- | --- | --- |
| r.bastion.sw / .se / .nw / .ne | Corner bastions | 6 x 6 m at each corner of the house outline | Reinforced 0.5 m walls, not destructible. Two slit windows each |
| r.radar-tower | Radar tower | [47,50] – [53,56] | Taller (ceiling 7), reinforced; the 6 m comm mast and a radar console stand inside; two slit windows |
| r.walk.west / .east | Side covered walkways | [28,22]–[30,50] and [70,22]–[72,50] | Stone walls, link bastion to bastion |
| r.walk.north.w / .e | North covered walkways | [34,54]–[47,56] and [53,54]–[66,56] | Link the northern bastions to the radar tower |
| r.deck.sun | Sun deck | [30,22] – [42,38] | Small sun deck: pergola, four loungers, a plunge pool (zones inside [31,24]–[41,37]) |
| r.deck.west-south | West wing south deck | [34,16] – [42,22] | West hatch housing at (40.6–41.6, 18–21) |
| r.deck.main | Main roof deck and air-defense site | [30,38] – [70,50] | AA launcher behind a U of sandbags at (47–53, 42–47), chimneys |
| r.deck.north.w / .e | North decks | [34,50]–[47,54] and [53,50]–[66,54] | Between the bastions and the radar tower |
| r.deck.yard | Mechanical yard | [58,22] – [70,38] | Three HVAC units, three solar rows, two dishes, the east hatch housing |
| r.deck.east-south | East wing south deck | [58,16] – [66,22] | |

- Defender positions: sniper in the northwest bastion (30,54), machine guns in the northeast bastion (70,54) and southwest bastion (33,18), anti-aircraft missile team on the main deck (50,46).
- Roof access: east hatch `link.roof` (upper (60,24)), west hatch `link.roof.west` (upper (40,19)), and a ladder `link.roof-ladder` from the north balcony (30,58) into the northwest bastion at (30,55), through a gap in its north wall (`d.r.nw-ladder`) and in the parapet.

## Smart home
Data-only markers for now (kind `poi`, tagged `smart:*`); all report to the hub in the security operations center. Primary hub (66,30) in `g.soc`, backup hub (8,11) in the power house. 14 cameras (gate, west and east fences, two southern corners, helipad, terrace, east garden, marina, garage, foyer, grand hall, courtyard, roof), 6 floodlights, 4 motion sensors and 3 smart locks (front door, SOC, panic room). Runtime behavior (camera feeds, hacking, lights) comes in a later task.

## Vertical links
| Id | Kind | From | To |
| --- | --- | --- | --- |
| link.grand-stairs.west | stairs | ground (40,41) | upper (40,50.2) |
| link.grand-stairs.east | stairs | ground (60,41) | upper (60,50.2) |
| link.stairs | stairs (service) | ground (60,30) | upper (60,30) (straight up; not drawn as steps yet) |
| link.roof | roof-access | upper (60,24) | roof (60,24) |
| link.roof.west | roof-access | upper (40,19) | roof (40,19) |
| link.roof-ladder | roof-access | upper (30,58) | roof (30,55) |
| link.shaft | shaft | upper (70,26) | ground (70,26), one way down; principal and family only until breached |
| link.tunnel | shaft | ground (66,18) | grounds (85,0) boathouse; long tunnel, about 60 s on foot |
| link.cliff | cliff-path | grounds (18,-6) | grounds (18,0) |

## Guard and spawn defaults (seeded variation added later)
- Outer ring (hired, 6): guardhouse (2), patrol along the inner perimeter (2), marina (1), terrace (1).
- REQUIEM veterans (12): roof positions (4: three bastions and the AA site), guard room (2), grand hall (2), garden-east (2), helipad edge (2).
- Inner circle (6): near the principal at all times.
- Reaction force (8): guest villa.
- Principal at night: master suite or study (seeded). Drive: study desk, office safe, or on his person (seeded).
- Family (if present): wife in her suite, son and daughter in their rooms.

## Version 5: levels and the modern restyle

- New floors (contract change approved 2026-11-03): `lower` (-4 m, basement), `shore` (-5 m) and `hill` (+4 m). See `docs/decisions.md`.
- **Basement (`lower`)**: l.gym, l.storage, l.cellar (west block), l.corridor.w, l.armory, l.vault (under the hall, blast doors), l.corridor.e, l.mech (plant room and generator) and l.staff. Stairs: `link.cellar-stairs` (library to cellar) and `link.plant-stairs` (service room to plant room), each with a `gallery-void` opening in the ground floor.
- **Shore**: the boathouse, store, yacht, yacht bow and dock lounge, with the sea and marina zones. The tunnel exits in the boathouse (on the shore). `link.cliff` (cliff path, x = 18) and `link.shore-stair` (stairs, x = 71) climb to the lawn.
- **Hill**: the four neighbor-villa rooms on raised lawns (zones `zone.hill.west`, `zone.hill.east`).
- **Upper floor**: the gym wing is now a covered sun terrace (`u.terrace.sw`) over the master suite; the sky lounge (`u.sky-lounge`) cantilevers over the south terrace (see version 6 and the v12 note below), reached through the south balcony. The gym moved to the basement.
- **Style**: classical v4 features removed (belvedere, colonnades, parterre, balustrades, urns); the entrance has a flat canopy on two piers (`cover.canopy-pier.*`); planters on the terraces and the main roof deck.

## Version 6: the zigzag of three bars (supersedes the house, ground, upper, roof and link sections above)

The U-shaped courtyard house is replaced by three 42 x 15 m bars, each slid sideways from the last, so the house is a staircase with open notches rather than a ring. North is up (gate, drive, helipad).

- **Bar A** (x18-60, y41-56, two storeys plus roof): library, wine room, cloak, foyer (front door at x=41 under a flat canopy on two piers), guard room, double-height grand hall (22 x 9 m, ceiling 8), dining, kitchen; covered walkway east to the garage. Upper: son, office, cinema, gallery bridge over the hall void, wife; north balcony with the roof ladder.
- **Bar B** (x40-82, y26-41, two storeys plus roof): drawing, study, stair core, PANIC ROOM (x66-76, y31-41) with the SOC south of it, service/generator/staff entrance, stair core, master suite, master bath. Upper: guest, spa, core, SAFE LANDING (same rect as the panic room), daughter, second guest suite, bath, and the SKY LOUNGE, which cantilevers 5 m south over the pool edge (was 9 m before 2026-11-04).
- **Bar C** (x12-54, y11-26, one storey): lounge and bar, long living room with a glass wall to the pool. Its roof is the upper-level terrace.
- **Notches:** west garden (x12-40, y26-41); pool notch (x54-82, y11-26) with the 24 x 9 m pool.
- **Roof** (z +8, bars A and B only): four bastions, radar tower, main deck with the air-defense site, sun deck with plunge pool, and a deck over the cantilever.
- **Grand stairs:** two flights (x=32 and x=50, 9 m run, 4 m rise) from the hall floor to the gallery bridge; the middle of the hall stays open.
- **Basement** (z -4, under A and B): wine cellar, armory, vault, staff rooms, gym, spa with indoor pool, plant room and two service corridors. Stairs: `link.cellar-stairs` (library) and `link.plant-stairs` (service room), each with a ground-floor opening.
- **Links:** panic room to boathouse tunnel from (68,34); shaft at (73,36); roof hatches `link.roof` (64,38), `link.roof.west` (42,28) and the ladder at (21,58)-(21,55).
- **Fast-rope balcony** moved to the upper level over the pool, marker at (71,23).

## Version 7: roof pavilion, fortified wall, terrain

- **Roof:** the north-east deck strip is now `r.pavilion`, a walled glass-fronted structure beside the radar tower; the main deck gets three concealment beds (`cover.roof-garden.*`).
- **Perimeter (west, north, east only; the sea side stays open, no guard towers):** 16 reinforced wall piers (`cover.wall-pier.*`, 3.8 m, indestructible), two of them flanking the main gate; a gate chicane (`cover.gate-barrier.1/2`, 1.6 m gap); 8 bollards along the drive; six more floodlight posts, each with a smart floodlight marker feeding the SOC.
- **Terrain:** four earth berms inside the west and east walls, six rock outcrops along the cliff edge, two retaining walls in the garden notch. All heavy, indestructible cover. (A true slope would need a heightfield, a contract change.)
- **Viewer:** press L to toggle room name labels. A label hides while a higher visible floor covers its room.

## Version 8: a busier roof

Open decks and terraces now draw in a warm timber color so a roof reads as a place. Deck B is split around a new walled rooftop plant house (`r.plant-house`, generator and equipment inside); HVAC units moved to deck B west; two skylights over the double-height hall. Known cosmetic: thin white lines on the roof are the tops of interior plaster walls on the floor below, flush with the roof slab.

## v9: utilities, comms, intel and network layer (markers only)

Tag conventions (no geometry changes):
- Power: `power:<mains|transformer|generator|fuel|battery>` with `supplies:<circuit>`; breaker panels are `util:panel` + `feeds:<circuit>`. Circuits: c.gate, c.house.a/b/c, c.roof, c.perimeter, c.soc, c.panic. The panic circuit is never fed by mains.
- Devices carry `circuit:<id>` and `vlan:<guest|house|security|panic>`. Two hubs sit on different circuits (primary c.soc, backup c.perimeter).
- Comms: `comms:<landline|fiber|sat|radio-base|antenna|cell|sat-phone|hardline|siren|intercom>`.
- Intel: `intel:item` with `id:`, `type:` (digital|paper|physical), `value:`, optional `wipe:yes`.
- Network: `net:<router|dvr|sat-modem|wifi|keypad|entry>`; entry nodes have `access:<physical|wifi|remote>`. No wifi in the panic room (air gap).
- Do not use the `smart:` prefix for non-devices; the sim throws on unknown kinds.

## v10: access control and security fixtures (markers only)

- Readers: `auth:<keypad|biometric|badge|key|dial>` + `door:<doorId>` + `level:<1-4>`. Networked readers (keypad, biometric, badge) also carry `circuit:` and `vlan:`; keys and dials are mechanical and carry neither, so they work with no power or network.
- Panic room doors (`d.g.panic-core`, `d.u.safe-core`): biometric + keypad on circuit c.panic, vlan panic. The vault door has a mechanical dial plus a biometric reader.
- Fixtures `sec:<alarm-panel|panic-button|metal-detector|key-cabinet|monitor|laser-grid|suppression|ground-sensor|barrier-control|safe|armory-rack>`.
- Validator `checkAccess`: reader must name a real door on its floor, stand within 4 m of it, networked readers need a circuit, panic-room doors need a biometric reader.

## v11: fail modes and badges (markers only)

- Every networked reader and smart lock carries `fail:<open|secure>`: what the door does when its circuit loses power. Policy by door, not global: fail secure on the panic room, vault, armory, SOC, studies, office, plant/mechanical rooms and the perimeter gates; fail open (life safety egress) on the front door, gate lodge, garage and service door. One mode per door. Tunable by changing the tags; the sim runtime will read them.
- Badges: `item:badge` + `id:badge.<name>` + `level:<n>` + `clone:<yes|no>` + `held:<who>`. Guard, maintenance and SOC-chief badges can be stolen or cloned at the SOC `sec:badge-encoder`; the principal's level-4 badge cannot be cloned.
- Validator: bad fail mode, panic-room reader that fails open, badge outside a room.

## v12: building services, camera coverage, phones (markers only)

- Water and gas: `svc:water-main`, `svc:gas-main` (outdoors, north of the wall), `svc:water-shutoff`, `svc:gas-shutoff` (mechanical room), `svc:gas-appliance` (kitchen range).
- Air: three zones (`hvac:a|b|c`) each with an `svc:ahu` air handler on a circuit, roof `svc:vent-intake` markers, and `svc:vent-grate` in the main rooms. The panic room has its own `svc:air-filter` and no grate (validator enforces it), so gas cannot reach it.
- Fire: `svc:fire-panel` (SOC), `svc:smoke-detector`, `svc:sprinkler` (kitchen, grand hall, cellar).
- Lifts: `svc:elevator` on ground and upper, `link:link.stairs` names the stair link it duplicates (runtime can halt or hijack it).
- Cameras: `sees:<roomId>` lists the rooms an indoor camera sees (validator checks the rooms exist). New cameras: vault, basement corridor, gallery, service, plant. The panic room, safe landing, principal's study and master suite are deliberately unseen. `sec:blind-spot` + `why:` marks five outdoor/balcony gaps.
- Phones: `comms:pbx` (guard room) and ten `comms:phone` markers with unique `ext:` values.

## Sky lounge shortened (2026-11-04, Scott: 9 m "too much")
`u.sky-lounge` is now x54-66, y21-33: a 5 m cantilever past the bar's south wall (y26), with no columns. Changed with it: its south wall and two shuttered windows moved to y=21 (the east window is gone; the balcony covers that side), the sofas moved to y23-26, the terrace door to y=23.5, the roof deck `r.deck.lounge` and its parapets to y21-26. The east glass balcony (`u.balcony.e`) is unchanged.
