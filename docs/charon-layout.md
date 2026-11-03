# CHARON layout (dimensions for T5)

Use these coordinates to author `content/maps/charon.json`. All rooms are axis-aligned rectangles: `[minX, minY] – [maxX, maxY]` in meters. North is +y. The sea is to the south (y < 0).

## Compound (floor `grounds`, z = 0)
| Id | What | Rect | Notes |
| --- | --- | --- | --- |
| grounds.estate | Walled estate | [0,0] – [100,80] | Perimeter wall on west, north, east sides (material `perimeter`, 3 m high, 0.6 m thick, heavy cover) |
| grounds.cliff | Seawall and cliff edge | along y = 0, x 0–100 | 6 m drop to the beach; `cliff-path` vertical link at x 18 for divers (approach E) |
| grounds.highway | Coastal highway (outside) | [-20,84] – [120,94] | Zone `road`; reaction force and host police arrive along it |
| grounds.gate | Main gate | door at (69,80), width 6, kind `gate` | Approach A |
| grounds.guardhouse | Gate guardhouse | [72,76] – [76,80] | Guard post: outer ring |
| grounds.guest-villa | Guest villa (reaction force) | [74,60] – [94,74] | 8 reaction force spawn points |
| grounds.garage | Garage with armored SUVs | [74,52] – [94,60] | Vehicles are heavy cover |
| grounds.staff | Staff quarters | [6,60] – [24,74] | Civilian staff spawn |
| grounds.helipad | Helipad | [40,60] – [56,76] | `lz` marker; approach C |
| grounds.drive | Driveway | from gate (69,80) to house front (50,56) | Zone `exposed` |
| grounds.house | Main residence footprint | [32,16] – [68,56] | See ground and upper floors |
| grounds.terrace | Terrace | [32,10] – [68,16] | Zone `terrace`; planters along y = 16 are light cover |
| grounds.pool | Pool | [40,3] – [60,9] | Zone `pool` (exposed) |
| grounds.lawn | Lawn | [0,0] – [100,16] minus terrace and pool | Zone `exposed` |
| grounds.garden-east | Garden, hedges, palms | [72,16] – [96,50] | Zone `garden` (concealment) |
| grounds.trees-west | Trees | [4,20] – [28,50] | Zone `garden` (concealment) |
| grounds.marina | Marina and dock | [78,-12] – [96,0] | Zone `marina`; approach D at dock (88,-2) |
| grounds.boathouse | Boathouse (tunnel exit) | [80,-4] – [90,2] | Tunnel exit point (85,0) |
| grounds.yacht | His armed yacht | [84,-12] – [96,-6] | Escape option; can be disabled |
| grounds.sea | Black Sea | [-20,-40] – [120,0] | Zone `sea`; boat approach |

Approach markers: A gate (69,81); B west wall breach (0,40); C helipad (48,68) or roof fast-rope; D dock (88,-2); E cliff path (18,0).

Neighboring villas (outside the walls, collateral risk): west [-40,20] – [-10,60], east [110,20] – [140,60].

## Ground floor (floor `ground`, z = 0), house-relative offset: add (32,16)
House-local coordinates below run x 0–36, y 0–40. Add 32 to x and 16 to y for map coordinates.

| Id | Room | Local rect | Notes |
| --- | --- | --- | --- |
| g.hall | Central hall | [16,0] – [20,36] | The long hallway; south end has glass doors to the terrace at (18,0) |
| g.foyer | Foyer | [16,36] – [20,40] | Main doors at (18,40), approach A side |
| g.great | Great room | [0,24] – [16,40] | Double height (ceiling 8); under the upper gallery void |
| g.dining | Dining room | [0,16] – [16,24] | Long table: light cover |
| g.study | Study | [0,8] – [16,16] | Desk: heavy cover. Possible drive location |
| g.master | Master suite | [0,0] – [16,8] | Door to hall; glass door to terrace at (8,0) |
| g.kitchen | Kitchen | [20,30] – [36,40] | Island: heavy cover |
| g.pantry | Pantry | [20,25] – [28,30] | |
| g.mud | Mud room | [28,25] – [36,30] | Exterior side door on east wall at (36,27.5) |
| g.security | Security office | [20,18] – [36,25] | CCTV and alarm servers; guard post |
| g.stairs | Stairwell | [20,12] – [28,18] | Stairs to upper floor and roof |
| g.wc | Guest WC | [28,12] – [36,18] | |
| g.panic | Panic room | [20,0] – [30,12] | Reinforced walls; blast door on the hall at (20,6); floor hatch to tunnel at (25,2); shaft up at (28,10) |
| g.generator | Generator and utility | [30,0] – [36,12] | Backup power; target for the power cut |

Doors: every room opens to `g.hall` on its hall-facing wall, centered unless noted. Great room also opens to the foyer. Kitchen connects to pantry; pantry connects to mud room. Generator room opens to the mud-room side via an exterior door at (36,6).

Exterior walls: `reinforced`. Interior walls: `plaster`, except panic room walls (`reinforced`, not destructible). South wall of the hall and master suite has glass doors (kind `glass`).

## Upper floor (floor `upper`, z = 4), same house-relative offset
| Id | Room | Local rect | Notes |
| --- | --- | --- | --- |
| u.hall | Upper hall | [16,0] – [20,36] | Runs the length of the floor |
| u.gallery | Gallery walkway | [12,24] – [16,40] | Railing on its west edge; sees down into the great room |
| u.void | Great room void | [0,24] – [12,40] | Opening (`gallery-void`) to `ground` |
| u.office | Private office | [0,16] – [16,24] | Safe: possible second drive |
| u.guest | Guest room | [0,8] – [16,16] | |
| u.son | Son's room | [0,0] – [16,8] | Tag `family` |
| u.wife | Wife's suite | [20,28] – [36,40] | Tag `family` |
| u.bath | Bathroom | [20,18] – [28,28] | |
| u.linen | Linen | [28,18] – [36,28] | |
| u.stairs | Stair landing | [20,12] – [28,18] | Stairs down and up to the roof |
| u.safe | Safe landing | [20,0] – [30,12] | Reinforced; shaft down to the panic room at (28,10); door from hall at (20,6) |
| u.daughter | Daughter's room | [30,0] – [36,12] | Tag `family`; next to the safe landing |
| u.balcony | Balcony (exterior) | [0,-3] – [36,0] | Glass doors from son's room and safe landing; fast-rope point (approach C) |

## Roof (floor `roof`, z = 8)
- Flat roof over the whole house footprint, local [0,0] – [36,40], with a 1 m parapet (light cover, facing outward).
- Roof access hatch above the stairwell at local (24,15).
- Defender positions: sniper at local (2,38), machine gun at (34,38), machine gun at (18,2), anti-aircraft missile team at (18,20).

## Key vertical links
| Id | Kind | From | To |
| --- | --- | --- | --- |
| link.stairs | stairs | ground (24,15) | upper (24,15) |
| link.roof | roof-access | upper (24,15) | roof (24,15) |
| link.shaft | shaft | upper (28,10) | ground (28,10) — principal and family only until breached |
| link.tunnel | shaft | ground (25,2) | grounds (85,0) boathouse — long tunnel, about 60 s on foot |
| link.cliff | cliff-path | grounds (18,-6) | grounds (18,0) |
All "local" coordinates above are house-relative: add (32,16) when writing map coordinates.

## Guard and spawn defaults (seeded variation added later)
- Outer ring (hired, 6): guardhouse (2), patrol along the inner perimeter (2), marina (1), terrace (1).
- REQUIEM veterans (12): roof positions (4), security office (2), hall (2), garden-east (2), helipad edge (2).
- Inner circle (6): near the principal at all times.
- Reaction force (8): guest villa.
- Principal at night: master suite or study (seeded). Drive: study desk, office safe, or on his person (seeded).
- Family (if present): wife in her suite, son and daughter in their rooms.
