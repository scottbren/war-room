# CHARON layout (map version 2: the courtyard villa)

`content/maps/charon.json` implements this document. All rooms are axis-aligned rectangles, `[minX, minY] – [maxX, maxY]` in meters, in **map coordinates**. North is +y. The sea is to the south (y < 0). Non-rectangular buildings are composed from several rectangles (U, L and stepped shapes); the map format has no polygon rooms.

Version 2 replaced the original single rectangular block (see `docs/decisions.md`). Everything gameplay depends on is unchanged: the approach points, gate, helipad, marina, the panic room / shaft / tunnel roles, family rooms upstairs, the guard counts, and the reaction force in the guest villa.

## Compound (floor `grounds`, z = 0)
| Id | What | Rect | Notes |
| --- | --- | --- | --- |
| grounds.estate | Walled estate | [0,0] – [100,80] | Perimeter wall on west, north, east (material `perimeter`, 3 m high, 0.6 m thick); hand-authored `w.fixed.*` walls, with a 6 m gap for the gate |
| grounds.cliff | Seawall and cliff edge | along y = 0, x 0–100 | 6 m drop to the beach; `cliff-path` link at x 18 for divers (approach E) |
| grounds.highway | Coastal highway (outside) | [-20,84] – [120,94] | Zone `road` |
| grounds.gate | Main gate | door at (69,80), width 6, kind `gate` | Approach A. Joins outside to outside (it sits in the perimeter wall, not between rooms) |
| grounds.guardhouse | Gate guardhouse | [72,76] – [76,80] | Outer-ring guard post |
| grounds.gate-lodge | Gate lodge | [62,76] – [66,80] | Mirrors the guardhouse on the other side of the gate |
| grounds.guest-villa (+ .wing) | Guest villa, **L-shaped** (reaction force) | [74,60] – [94,68] and wing [84,68] – [94,74] | 8 reaction-force posts |
| grounds.garage | Garage with armored SUVs | [74,52] – [94,60] | SUVs are heavy cover |
| grounds.staff (+ .wing) | Staff quarters, **L-shaped** | [6,60] – [24,68] and wing [6,68] – [14,74] | Civilian staff spawn |
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
| g.security | Security office | [54,52] – [62,56] | CCTV and alarm servers; guard post |
| g.grand-hall | Grand hall | [38,38] – [62,52] | Double height (ceiling 8). Piano (light cover). **Twin grand staircases**: two walkable marble flights, 3 m wide and 9.2 m long, run up the west and east walls from y = 41 and rise 4 m to the gallery (x = 40 and x = 60). A balustrade rail (light cover) lines each flight's open edge. The flights are drawn as real steps from the `stairs` links, not as solid blocks. Glass doors to the courtyard at (50,38) |
| g.library | Library | [28,46] – [38,56] | |
| g.drawing | Drawing room | [28,38] – [38,46] | Sofas: light cover |
| g.dining | Formal dining room | [62,46] – [72,56] | Long table: light cover |
| g.kitchen | Kitchen | [62,38] – [72,46] | Island: heavy cover |
| g.master | Master suite | [28,16] – [38,28] | West wing; glass door to the terrace at (33,16). Principal option |
| g.study | Study | [28,28] – [38,38] | Desk: heavy cover. Possible drive location. Principal option |
| g.loggia.w | West loggia | [38,16] – [42,38] | Arcade; five columns along its courtyard edge |
| g.courtyard | Pool courtyard | [42,16] – [58,38] | Open air (tag `exterior`). Pool, fountain, four loungers. A low glass balustrade closes its south edge, with an 8 m gap at (50,16) |
| g.loggia.e | East loggia | [58,16] – [62,38] | Arcade; five columns; service stairs at (60,30) |
| g.panic | Panic room | [62,16] – [72,28] | East wing. Reinforced walls, not destructible; blast door on the loggia at (62,22); floor hatch to the tunnel at (66,18); shaft up at (70,26) |
| g.generator | Generator and utility | [62,28] – [72,33] | Backup power; target for the power cut. Exterior door (72,30.5) |
| g.pantry | Pantry and service entry | [62,33] – [72,38] | Exterior service door (72,35.5); connects to the kitchen |

Rooms tagged `hall` (grand hall, both loggias, the gallery and the upper galleries) are the circulation spaces; the panic room's door opens to one of them. Interior walls are `plaster`; exterior walls `reinforced`; panic room and safe landing walls `reinforced` and not destructible. Glass doors (kind `glass`) face the terrace from the master suite and the courtyard from the grand hall. There are no windows: it is a fortified home, with shutters and blast-rated glass doors only.

## Upper floor (floor `upper`, z = 4)
| Id | Room | Rect | Notes |
| --- | --- | --- | --- |
| u.void | Grand hall void | [38,38] – [62,50] | Open to the ground floor (`gallery-void` opening) |
| u.gallery | Gallery walkway | [38,50] – [62,52] | Where both grand staircases arrive; glass railing along the void. Doors to the office, lounge, son's room and wife's suite |
| u.office | Private office | [38,52] – [50,56] | Safe: possible second drive |
| u.lounge | Upper lounge | [50,52] – [62,56] | |
| u.son | Son's room | [28,46] – [38,56] | Tag `family`; glass door to the north balcony |
| u.guest.1 / .2 / .3 | Guest suites | [28,38]–[38,46], [28,28]–[38,38], [28,16]–[38,28] | West wing, in a row |
| u.loggia.w | West gallery | [38,16] – [42,38] | Railing onto the open courtyard |
| u.court-void | Courtyard void | [42,16] – [58,38] | Open air above the courtyard (`gallery-void` opening) |
| u.loggia.e | East gallery | [58,16] – [62,38] | Service stairs down at (60,30); roof hatch at (60,24) |
| u.wife | Wife's suite | [62,38] – [72,56] | Tag `family` |
| u.safe | Safe landing | [62,16] – [72,28] | Directly over the panic room. Reinforced; shaft down at (70,26); glass door to the south balcony |
| u.daughter | Daughter's room | [62,28] – [72,34] | Tag `family`; next to the safe landing |
| u.bath | Bathroom | [62,34] – [72,38] | |
| u.balcony.e | South balcony | [62,13] – [72,16] | Exterior; fast-rope point (approach C) |
| u.balcony.n | North balcony | [28,56] – [38,59] | Exterior, off the son's room |

## Roof (floor `roof`, z = 8)
- Three connected sections over the house outline: west wing [28,16]–[42,38], main block [28,38]–[72,56], east wing [58,16]–[72,38]; open 6 m gaps join them at (35,38) and (65,38).
- A 1 m parapet (light cover, facing outward) runs around the whole U outline and around the courtyard's rim (eight strips). The roof has no derived walls.
- Roof access hatch above the east gallery at (60,24).
- Defender positions: sniper at (30,54), machine gun at (70,54), machine gun at (33,18), anti-aircraft missile team at (50,46). Each gun post has a sandbag nest (light cover); the AA team has its launcher (heavy cover).
- West wing roof: a sun deck (zone `terrace`, [29,22]–[41,37]) with a plunge pool ([31,30]–[39,36]), a four-post pergola and four loungers.
- East wing roof: a mechanical yard with three HVAC units (heavy cover), three rows of solar panels, two satellite dishes, and a housing around the roof hatch ((60,24); the housing starts at x = 60.8).
- Main roof: a 6 m comm mast, two chimney stacks and the AA launcher.

## Vertical links
| Id | Kind | From | To |
| --- | --- | --- | --- |
| link.grand-stairs.west | stairs | ground (40,41) | upper (40,50.2) |
| link.grand-stairs.east | stairs | ground (60,41) | upper (60,50.2) |
| link.stairs | stairs (service) | ground (60,30) | upper (60,30) (straight up; not drawn as steps yet) |
| link.roof | roof-access | upper (60,24) | roof (60,24) |
| link.shaft | shaft | upper (70,26) | ground (70,26), one way down; principal and family only until breached |
| link.tunnel | shaft | ground (66,18) | grounds (85,0) boathouse; long tunnel, about 60 s on foot |
| link.cliff | cliff-path | grounds (18,-6) | grounds (18,0) |

## Guard and spawn defaults (seeded variation added later)
- Outer ring (hired, 6): guardhouse (2), patrol along the inner perimeter (2), marina (1), terrace (1).
- REQUIEM veterans (12): roof positions (4), security office (2), grand hall (2), garden-east (2), helipad edge (2).
- Inner circle (6): near the principal at all times.
- Reaction force (8): guest villa.
- Principal at night: master suite or study (seeded). Drive: study desk, office safe, or on his person (seeded).
- Family (if present): wife in her suite, son and daughter in their rooms.
