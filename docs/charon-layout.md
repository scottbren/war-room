# CHARON layout (current: map version 12 plus the 2026-11-04 changes)

This is the single current description of CHARON. It replaces the earlier stack of per-version patches (v2 to v14), which no longer exist as separate sections. The history of why things changed is in `docs/decisions.md`. If this document and `packages/content/maps/charon.json` disagree, the JSON wins; fix the document.

`content/maps/charon.json` is generated and committed. Edit it with a script, then run `pnpm derive-walls`, `pnpm bake-navmesh` and `pnpm --filter @war-room/tools record-t12`, and check with `pnpm validate-map`.

Conventions
- All rooms are axis-aligned rectangles, `[minX, minY] – [maxX, maxY]` in meters, in map coordinates. North is +y (gate, drive and helipad are north; the sea is south, y < 0).
- Floors: `shore` (-5), `lower` (-4), `grounds` and `ground` (0), `upper` and `hill` (+4), `roof` (+8). `grounds` is the outdoor level; `ground` is the ground floor of the house.
- Walls are derived from room edges (`pnpm derive-walls`). Door gaps are cut; windows do not cut. Wall height is the lowest ceiling of the rooms it separates. A shared edge between two rooms both tagged `gallery` has no wall.
- Counts: about 280 markers, 30 zones, 20 + 16 + 14 windows on the ground, upper and roof floors.

## The compound (floor `grounds`)
Walled estate [0,0] – [100,80]. Perimeter wall (3 m) on the west, north and east; the sea side stays open. Sixteen reinforced wall piers, two flanking the gate; a gate chicane; eight drive bollards; berms inside the walls; rock outcrops along the cliff.

| Id | What | Rect |
| --- | --- | --- |
| grounds.guardhouse / gate-lodge | Gate posts either side of the main gate (door at (69,80), 6 m) | [72,76]–[76,80], [62,76]–[66,80] |
| grounds.guest-villa (+ .wing) | L-shaped, the 8-man reaction force | [74,60]–[94,68], wing [84,68]–[94,74] |
| grounds.garage | Armored SUVs, workbench, lift, two chargers | [74,52]–[94,60] |
| grounds.staff (+ .wing) | L-shaped staff quarters; staff gate on the west wall at (0,64) | [6,60]–[24,68], wing [6,68]–[14,74] |
| grounds.pool-house | Outdoor kitchen on its lawn side | [74,4]–[88,12] |
| grounds.cabana | By the infinity pool | [19,4]–[26,10] |
| grounds.power-house | Backup smart-home hub; locked | [4,8]–[12,14] |
| zone.helipad | Helipad, approach C | [40,60]–[56,76] |
| zones | Forecourt [56,60]–[66,76] and driveway; pool deck [54,12]–[82,25] with the 24 x 9 m pool; living terrace; lawns; infinity pool [4,1.5]–[16,6.5]; formal garden east [82,16]–[96,50] (paths, plaza, gazebo); grove west [2,20]–[12,50] with a pond; west garden notch [12,26]–[40,36] with the notch path; highway [-20,84]–[120,94]; sea |

Approach points: A gate (69,81); B west wall breach (0,40); C helipad (48,68) or fast-rope onto the upper balcony (71,23); D dock (88,-2); E cliff path (18,0).

Shore (z -5): boathouse [80,-4]–[90,2] (tunnel exit at (85,0)), store [76,-4]–[80,0], dock lounge [93,-4]–[99,1], his yacht [84,-12]–[94,-6] with a stepped bow, marina zone [78,-12]–[100,0]. Hill (z +4): four rooms making two neighboring villas (west, east), each an L. They are outside the walls, with collateral risk, and are not on the navmesh.

## The house: three bars in a zigzag
Three bars, each slid sideways from the last, so the house is a staircase with open notches instead of a ring.

- **Bar A** (x 18–60, y 41–56): two storeys plus roof. Entrance, grand hall, library, dining, kitchen, security office.
- **Bar B** (x 40–82, y 26–41): two storeys plus roof. Drawing room, study, stair core, panic room, SOC, service, master suite.
- **Bar C** (x 12–54, y 11–26): one storey. Lounge and living room with a glass wall to the pool. Its roof is the upper terrace.
- **Notches:** west garden (x 12–40, y 26–41) and the pool notch (x 54–82, y 11–26).

### Ground floor (z 0)
| Id | Room | Rect | Notes |
| --- | --- | --- | --- |
| g.portico | Porte-cochere | [36,56]–[46,60] | Exterior, ceiling 6, flat canopy on two piers. Front door d.g.main (41,56, 3 m, locked) opens from the foyer into it; d.g.portico-drive (41,60, 8 m) opens to the drive |
| g.foyer | Entrance foyer | [36,52]–[46,56] | 10 x 4 m; 6 m opening to the hall |
| g.cloak | Cloakroom | [30,52]–[36,56] | Door (36,53) from the foyer |
| g.security | Security office | [46,52]–[52,56] | Front guard post; door (46,53) |
| g.grand-hall | Grand hall | [30,41]–[52,52] | Ceiling 8, tag `hall`. Clear of furniture. Entered under the upper gallery bridge (y 50–52). One wide floating flight, below |
| g.garden-room | Garden room | [30,36]–[40,41] | Open 6 m to the hall at (35,41); glass doors to the lawn (35,36) and terrace (30,38.5), and to the drawing room (40,38.5) |
| g.library | Library | [18,45]–[30,56] | Hall door (30,47.5); French door west (18,50); large front window |
| g.wine-room | Wine room and humidor | [18,41]–[30,45] | Hall door (30,43); library door (27,45); stairs down to the cellar start in the library at (26,55) |
| g.dining | Formal dining room | [52,47]–[60,56] | Hall door (52,48.5); large front window; door east to the garage walkway (60,54) |
| g.kitchen | Kitchen | [52,41]–[60,47] | Island (heavy cover); doors to dining (56,47), the service core (59,41, 1.2 m) and the yard (60,44) |
| g.garage-link | Covered walkway | [60,52]–[74,56] | Tag `walkway`; locked door to the garage side (74,54) |
| g.drawing | Drawing room | [40,33]–[50,41] | Grand piano. 3 m hall door (45,41) |
| g.study | Study | [50,33]–[58,41] | Tag `drive-option`; desk (heavy cover) |
| g.core | Stair and lift core | [58,33]–[66,41] | Tag `hall`; service stairs `link.stairs` at (60,36) |
| g.panic | Panic room | [66,31]–[76,41] | Reinforced, not destructible; blast door d.g.panic-core (66,37); tunnel `link.tunnel` from (68,34); shaft at (73,36); supply locker and medical cabinet |
| g.soc | Security operations center | [66,26]–[76,31] | Tags `security-center`, `smart-hub`; north of the panic room; locked door (66,28.5) to the master bath |
| g.service | Generator, pantry, staff entrance | [76,26]–[82,41] | Locked exterior door (77,26); stairs down to the plant room at (80,38) |
| g.core.bc | Stair core | [40,26]–[46,33] | Second stair, `link.stairs.bc` at (44,31) |
| g.master | Master suite | [46,26]–[58,33] | Tag `principal-option`; living-room door (50,26) |
| g.master-bath | Master bath | [58,26]–[66,33] | |
| g.lounge | Lounge and bar | [12,11]–[26,26] | Bar C; glass door west (19,26) |
| g.living | Living room | [26,11]–[54,26] | Ceiling 5; glass doors to the pool (54,18) and the lawn (38,11) |

The study and the master suite are also joined by a hidden bookcase door; see Secrets.

### Upper floor (z +4)
The upper floor over the hall is a U of galleries round a void [32.5,43]–[49.5,50]: north gallery u.gallery.n [30,41]–[52,43], west gallery u.gallery.w [30,43]–[32.5,50], east gallery u.gallery.e [49.5,43]–[52,50], and the bridge u.gallery [30,50]–[52,52] over the hall entrance.

| Id | Room | Rect | Notes |
| --- | --- | --- | --- |
| u.son | Son's room | [18,41]–[30,56] | Tag `family`; glass door to the north balcony |
| u.office | Private office | [30,52]–[41,56] | Safe; possible drive location |
| u.cinema | Screening room | [41,52]–[52,56] | |
| u.wife | Wife's suite | [52,41]–[60,56] | Tag `family` |
| u.balcony.n | North balcony | [18,56]–[30,59] | Exterior; roof ladder from (21,58) |
| u.guest / u.spa / u.core | Guest suite, spa and sauna, stair core | [40,33]–[50,41], [50,33]–[58,41], [58,33]–[66,41] | |
| u.safe | Safe landing | [66,31]–[76,41] | Over the panic room; same rect; reinforced |
| u.daughter | Daughter's room | [66,26]–[76,31] | Tag `family` |
| u.guest2 | Second guest suite | [76,26]–[82,41] | |
| u.core.bc / u.bath | Stair core, bathroom | [40,26]–[46,33], [46,26]–[54,33] | |
| u.sky-lounge | Sky lounge | [54,21]–[66,33] | Cantilevers 5 m south past the bar's south wall; no columns |
| u.walkway.sw | Sky gallery (open colonnade) | [40,21]–[54,26] | Tag `arcade`, `walkway` (roofed, ceiling 4, no `interior` tag so bar C stays one storey). Continues the cantilever's south face west along the bar to the southwest bastion's corner (x 40), standing on the low bar's roof (no cantilever needed). Glass door to the lounge at (54,23.5), door to the stair core at (43,26), its north and west sides are OPEN to the terrace (no wall, no door; derive-walls leaves an arcade edge shared with an exterior room bare), so it reads as a colonnade. The terrace is now two rooms (`u.terrace.c`, `u.terrace.c.e`) joined by a 9.8 m opening at (40,16). The bath lost its south window |
| u.terrace.c | Upper terrace | [12,11]–[54,26] | Exterior, the roof of bar C |
| u.balcony.e | Fast-rope balcony | [66,20]–[76,26] | Exterior; marker at (71,23) |

### Grand stair
One floating flight, 3.6 m wide (x 39.2–42.8), rising north from the foot at (41,49.8) on the ground floor to the north gallery at (41,42.8). Link `link.grand-stairs.central`; upper opening d.u.stair-top (41,43, 3.6 m). The greybox draws thin open treads on a steel spine with glass balustrades and nothing solid underneath. For routing only the low steps (headroom under 2.1 m) are blocked; the client lifts a capsule along the flight. Door and window openings under the high steps work normally.

### Roof (z +8)
Bars A and B only. Four bastions (nw [18,50]–[24,56], ne [54,50]–[60,56], sw [40,26]–[46,33], se [76,26]–[82,33]), radar tower [36,50]–[42,56] (ceiling 7), pavilion [42,50]–[54,56], rooftop plant house [68,35]–[80,41], and decks: north deck west, main deck A [18,41]–[60,50] with the air-defense site, sun deck B [40,33]–[68,41] with plunge pool, south deck, cantilever deck, south-east and east decks. Reinforced bastion walls with slit windows. Three concealment beds on the main deck, parapet cover, skylights over the hall. Defender positions: sniper in the northwest bastion, machine guns in the northeast and southwest bastions, an anti-aircraft team on the main deck.

### Basement (lower, z -4)
Under A and B. West block: wine cellar [18,41]–[30,56], armory [30,41]–[42,50], vault and server room [42,41]–[52,50] (blast door, mechanical dial plus biometric), staff rooms [52,41]–[60,50]. Service corridor A [30,50]–[60,56] runs under the front. South block: gym [40,33]–[50,41], spa and indoor pool [50,33]–[66,41], service corridor B [40,26]–[66,33], plant room and generator [66,26]–[82,41]. No windows.

## Vertical links
| Id | Kind | From | To |
| --- | --- | --- | --- |
| link.grand-stairs.central | stairs | ground (41,49.8) | upper (41,42.8) |
| link.stairs | stairs | ground (60,36) | upper (60,36) |
| link.stairs.bc | stairs | ground (44,31) | upper (44,31) |
| link.roof | roof-access | upper (64,38) | roof (64,38) |
| link.roof.west | roof-access | upper (42,28) | roof (42,28) |
| link.roof-ladder | roof-access | upper (21,58) | roof (21,55) |
| link.shaft | shaft | upper (73,36) | ground (73,36); one way down; `principal` and `family` only until breached |
| link.tunnel | shaft | ground (68,34) | shore (85,0); long, about 60 s on foot |
| link.cliff | cliff-path | shore (18,-6) | grounds (18,0) |
| link.shore-stair | stairs | shore (71,-4) | grounds (71,4) |
| link.cellar-stairs | stairs | lower (26,46) | ground (26,55) |
| link.plant-stairs | stairs | lower (80,28) | ground (80,38) |

## Doors
Interior doors are 1.0–1.2 m; hall, dining, drawing and living doors are wider (2–3 m); the front door is 3 m. Kinds: standard, glass, blast (panic room, vault), gate. Glass doors face the lawn, terrace and pool from the garden room, library, lounge, living room and upper balconies. The full list is in the JSON; `pnpm validate-map` checks widths, reachability and that no room is reachable only through hidden doors.

## Windows
About 50 on the house, all blast-rated. Large armored glass windows (4 m, steel shutter) light the library and dining room on the front facade; 1.8 m windows light bedrooms and living spaces; narrow slits (0.4 m, no shutter) guard the wine room, guard room, SOC, bath and bastions. The panic room, safe landing and basement have none. Shutters default open and are meant to close as the alert level rises (runtime state, in the sim as smart-home state).

## Secrets, the cellar lock and family routines
- **Hidden bookcase door** `d.g.study-master` at (55.5,33), 1.2 m wide, `hidden: true`, between the study and the master suite. The viewer draws it as a dark-wood panel. It carries no lock marker. Neither room depends on it: both have ordinary doors. Until the knowledge layer exists (below) the navmesh treats it as an ordinary door.
- **Cellar keypad** `m.auth.l.cellar-corridor.keypad` at (30.75,52) in corridor A, on the now-locked `d.l.cellar-corridor`; level 2, fail secure, circuit c.house.a, vlan house. The library stairs still lead into the cellar.
- **Family routines** are mission data (`Mission.routines`, `Mission.raidTimeOptions`): a family member, a time window in minutes after midnight, a location marker and a probability. Spots: `m.routine.wife.spa` (60.5,40) and `m.routine.daughter.gym` (48.2,39.6), both in the basement. The sim does not spawn family or run routines yet.

## Smart home, utilities and security (markers only)
Marker tag namespaces are tied to validators; decorative markers use `fixture:` instead.
- `smart:*`: 14+ cameras, floodlights, motion sensors and smart locks, all reporting to the hub in the SOC (primary (66,30)) or the backup in the power house. Devices carry `circuit:` and `vlan:`.
- `power:*`, `util:*`, `supplies:`, `feeds:`: circuits c.gate, c.house.a/b/c, c.roof, c.perimeter, c.soc, c.panic. The panic circuit is never fed by mains.
- `comms:*`: landline, fiber, sat, radio, antenna, sirens, intercom, PBX and ten phones with unique `ext:`.
- `intel:item` (`id:`, `type:`, `value:`, optional `wipe:yes`); `net:*` (router, DVR, modem, wifi, keypad, entry); no wifi in the panic room.
- `auth:<keypad|biometric|badge|key|dial>` with `door:<id>` and `level:<1-4>`. Networked readers carry `fail:<open|secure>`: secure on the panic room, vault, armory, SOC, studies, office, plant rooms, cellar and perimeter gates; open on the front door, gate lodge, garage and service door. Badges (`item:badge`) can be stolen or cloned at the SOC encoder, except the principal's.
- `sec:*` fixtures (alarm panel, panic button, metal detector, key cabinet, monitor, laser grid, suppression, safe, armory rack, blind spots).
- `svc:*`: water, gas, three HVAC zones with air handlers, vents and grates (none in the panic room, which has its own filter), fire panel, smoke detectors, sprinklers, lifts. `sees:<roomId>` on indoor cameras; the panic room, safe landing, principal's study and master suite are deliberately unseen.
- `fixture:*`: 19 extinguishers, 7 exit signs, panic room supply locker and medical cabinet, gate intercom, path lights.

## Cover and concealment
About 190 cover items. Light cover: sofas, tables, planters, benches, parapets. Heavy cover: kitchen island, desks, armory racks, SUVs, server racks, berms and outcrops (indestructible). Concealment: trees, hedges, roof garden beds. The interiors pass (map version 13) added 51 items to 18 rooms; see below.

## Default populations (seeded variation later)
- Outer ring (hired, 6): guardhouse 2, perimeter patrol 2, marina 1, terrace 1.
- REQUIEM veterans (12): roof 4, guard room 2, grand hall 2, garden 2, helipad edge 2.
- Inner circle (6): with the principal. Reaction force (8): guest villa.
- Principal at night: master suite or study (seeded). Drive: study desk, office safe, or on his person.
- Family if present: wife in her suite, son and daughter in their rooms, or at their routine spots.

## Notes for later passes

### Interiors pass (done, map version 13)
Done: 51 cover items in 18 of the 19 rooms below, and a `light:bright|dim|dark` tag on all 85 rooms. **The grand hall was left clear**: the layout table says it is clear of furniture and a test enforces it, which contradicts it being in this list, so it waits for a decision (see `docs/open-decisions.md`). Light levels are a first pass by room use (windows and daylight rooms bright, bedrooms, corridors and outdoors dim, the cinema, cellar, boathouse and yacht dark) and are easy to change. Original brief: add furniture, cover and concealment to the **19 rooms that have none**: g.cloak, g.foyer, g.grand-hall, g.garage-link, g.core, g.core.bc, g.master-bath, u.gallery, u.core, u.safe, u.guest2, u.core.bc, u.bath, u.gallery.n, u.gallery.w, u.gallery.e, l.staff, l.corridor.a, l.corridor.b.
Also in this pass (approved): a **light-level tag on every room**, one of `bright`, `dim`, `dark`, for stealth and night vision. This is a room tag, not a contract change.

### Knowledge layer: the player's blueprint
The player should not see the full truth of the house. A "what the player knows of the house" layer (rooms known, doors known, devices known, with a confidence per item) is a knowledge-layer definition that belongs to the week-2 knowledge-layer work. Hidden doors only mean something once it exists: the operators' plan and routes ignore a hidden door until it is discovered. Interior patrols are deferred.
