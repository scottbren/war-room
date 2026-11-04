# Utilities, comms and cyber runtime: draft spec (tier 2)

Status: DRAFT for approval. Nothing here is implemented. Implementing it changes the public sim contract (new commands, events, snapshot fields), so it needs explicit approval first (golden rule 1).

Inputs are the map v12 marker tags (see `charon-layout.md`). All state is integer, ordered by id, deterministic, and part of the hash.

## 1. Power graph
- Nodes: sources (mains, transformer, generators, batteries), panels (`util:panel`, `feeds:<circuit>`), circuits, devices (`circuit:<id>`).
- A circuit is **live** when its panel breaker is closed AND at least one source that `supplies:` it is live.
  - mains is live unless the transformer or the mains marker is cut. Generators are live while fuel lasts (fuel tank intact) and the generator is started (auto-start 20 s after mains loss at tier-2 default). Batteries bridge the gap for a fixed number of ticks, then die.
  - c.panic is never on mains: it runs on the SOC battery and generator 1.
- A device on a dead circuit is `unpowered` (a new device state, distinct from `off`). Hubs that are unpowered stop alert automation (existing rule: automation needs a live hub).
- Commands: `setBreaker {panelId, closed}`, `cutSource {sourceId}`. Events: `power {circuitId, live}`.

## 2. Door fail modes
- On circuit loss a door's networked locks and readers apply their `fail:` tag: `open` unlocks, `secure` keeps the current lock (locks, once locked, stay locked; unlocked doors stay unlocked but readers refuse).
- Mechanical readers (`key`, `dial`) ignore power. Lockdown (alert 3) still locks interior doors unless the lock is dead.

## 3. Comms
- Channels: landline (junction + PBX), cell (tower), sat (dish + modem), radio (base + antenna), siren, intercom, hardline and sat-phone (panic room).
- A channel is `up` when its endpoints are live and uncut. Cutting is a raider action at the marker (landline junction, cell, antenna) or via the network.
- Effects: the house can call for help only while some channel is up; an up channel with a raised alarm starts a reinforcement timer. The panic-room hardline and sat-phone make it the last channel standing.
- Commands: `cutComms {markerId}`, `jam {channel}` (needs equipment). Events: `comms {channel, up}`.

## 4. Network and cyber actions (game design only)
- Segments (`vlan:`): guest, house, security, panic. Panic is air-gapped: reachable only from a reader/terminal inside the panic room (physical access).
- Raider access: an entry point (`net:entry`, `access:physical|wifi|remote`) gives a foothold on its segment. Pivots: guest to house to security, each pivot costs ticks and adds **detection risk**.
- Actions on a segment the raiders hold: loop camera, kill device, unlock/lock door, open/close shutter, trip or reset alarm, read DVR, halt lift, spoof a call, toggle sprinklers, change HVAC zone (gas), clone a badge at the encoder.
- Defender response: the SOC's operator can notice detection risk crossing a threshold and cut the segment, resetting a foothold.
- Commands: `hack {entryId}`, `pivot {segment}`, `netAction {deviceId, action}`. Events: `net {segment, state}`, `detected {level}`.

## 5. Services and fire
- Water shutoff kills sprinklers; gas shutoff and fuel tank affect the range and generators; HVAC zones can carry gas in through roof intakes and grates (the panic room is sealed and filtered). Fire alarm: smoke or `trip` raises the alarm, releases `fail:open` doors, and moves staff outside.

## 6. Intel (tier 3, later)
- Pickup from `intel:item` markers (type digital/paper/physical, value). Digital items can be copied remotely only if their segment is held. `wipe:yes` items can be wiped by the defenders when alarmed unless power or network is cut first.

## Open decisions before building
1. Generator auto-start delay and battery duration (tuning, can be data).
2. Whether cyber actions use the existing `Command` union or a new `NetCommand` union (new union is less invasive).
3. Detection risk visible to the player (knowledge layer) or hidden.
