# Contracts draft (input for T1)

These are the starting shapes for T1. Refine names and add fields where needed, but keep the structure. Everything here becomes a Zod schema (in `content`) or a TypeScript type (in `sim`). Scott reviews the result before any other work starts.

## Units and coordinates
- Meters. Map plane is x (east) and y (north). Height is `z`. In Babylon (y-up), map (x, y, z) renders as (x, z, y).
- Positions in simulation state are quantized to 1 cm (store as integer centimeters internally, or round on snapshot).
- Angles are integer degrees 0–359, measured clockwise from north. Never radians in gameplay code.
- Floors: `grounds` (outdoor, z = 0), `ground` (house ground floor, z = 0), `upper` (z = 4), `roof` (z = 8), plus three levels added in v4 (user-approved, see decisions.md): `lower` (basement under the house, indoor), `shore` (open-air, below the lawn) and `hill` (open-air, raised). `grounds` and `ground` share elevation but are separate floor ids so the house interior is its own layer.

## Map file (`content/src/schemas/map.ts`)
```ts
MapFile {
  id: string                      // "charon"
  version: number                 // bump on any change
  bounds: { min: Vec2, max: Vec2 }
  floors: Floor[]
  verticalLinks: VerticalLink[]
  zones: Zone[]
  markers: Marker[]
}
Vec2 { x: number, y: number }

Floor {
  id: "grounds" | "ground" | "upper" | "roof" | "lower" | "shore" | "hill"
  elevation: number               // meters
  rooms: Room[]
  walls: Wall[]                   // derived by tools/derive-walls, then committed
  doors: Door[]
  windows: Window[]
  openings: Opening[]             // e.g. the gallery void
  cover: Cover[]
}
Room {
  id: string                      // "g.study", "u.son"
  name: string
  rect: { min: Vec2, max: Vec2 }  // axis-aligned rectangles only for the slice
  ceiling: number                 // height in meters; 8 for double height
  tags: string[]                  // "interior", "exterior", "panic-room", "family", "objective"
}
Wall {
  id: string
  a: Vec2, b: Vec2
  thickness: number
  height: number
  material: "reinforced" | "stone" | "plaster" | "glass" | "perimeter"
  destructible: boolean
}
Door {
  id: string
  at: Vec2                        // center of the doorway, on a wall line
  width: number
  between: [string, string]       // room ids, or "outside"
  kind: "standard" | "glass" | "blast" | "gate" | "shutter"
  state: "open" | "closed" | "locked"
  breach: ("manual" | "shotgun" | "explosive" | "thermal-lance" | "hack")[]
  hidden?: boolean                // a secret door (bookcase, panel): works like any door, but is on no plan; only residents know it until found or shown by intel. Added 2026-11-04 (approved)
}
Window { id, at: Vec2, width, between: [string, string], shutter: boolean, blastRated: boolean }
Opening {
  id: string
  rect: { min: Vec2, max: Vec2 }
  kind: "gallery-void"            // you can see and shoot through to the floor below
  below: Floor["id"]
}
VerticalLink {
  id: string
  kind: "stairs" | "shaft" | "roof-access" | "cliff-path" | "fast-rope"
  from: { floor: Floor["id"], at: Vec2 }
  to:   { floor: Floor["id"], at: Vec2 }
  bidirectional: boolean
  restrictedTo?: ("defender" | "principal" | "operator")[]   // e.g. the shaft is principal-only until breached
}
Cover {
  id: string
  rect: { min: Vec2, max: Vec2 }
  type: "heavy" | "light" | "concealment"
  height: number                  // low cover < 1.2 m
  facing: number | "all"          // integer degrees the cover protects against
  destructible: boolean
}
Zone {
  id: string
  floor: Floor["id"]
  rect: { min: Vec2, max: Vec2 }
  kind: "exposed" | "pool" | "garden" | "marina" | "sea" | "road" | "lawn" | "terrace"
}
Marker {
  id: string
  floor: Floor["id"]
  kind: "spawn" | "guard-post" | "patrol" | "poi" | "lz" | "approach"
  at?: Vec2
  path?: Vec2[]                   // for patrols
  tags: string[]                  // e.g. "approach:A", "poi:drive", "guard:veteran"
}
```

## Other content schemas (minimal for week 1; expand later)
```ts
UnitType { id, side: "operator" | "defender" | "civilian" | "family" | "principal",
           speed: number, health: number, sightRange: number, nightVision: boolean,
           loyalty?: "hired" | "veteran" | "inner-circle" }
Team     { id, name, side, members: string[] }          // e.g. "alpha" with 4 operators
Equipment { id, name, kind, effects: Record<string, number> }
Mission  { id, mapId, seedPolicy: "random" | "fixed", principalSpawnOptions: string[],
           driveLocationOptions: string[], familyPresence: { wife: number, son: number, daughter: number },  // probabilities
           raidTimeOptions?: number[],          // minutes after midnight; the sim picks one with the seeded PRNG (added 2026-11-04, approved)
           routines?: Routine[],                // family habits checked against the raid time (added 2026-11-04, approved)
           complicationPool: string[], complicationsPerRun: [number, number] }
Routine  { id: string, member: "wife" | "son" | "daughter", from: number, to: number,   // minutes after midnight, from < to
           location: string,                    // marker id: a poi tagged "routine:<activity>" and "member:<member>"
           probability: number }                // chance they keep the habit that night, given they are home
DecisionCard { id, title, trigger: { event: string, conditions: Condition[] },
               reserved: boolean, defaultOptionId?: string,
               options: { id, label, effects: Effect[] }[] }
Complication { id, title, setup: Effect[], trigger: { event: string, conditions: Condition[] }, effects: Effect[] }
Condition = { path: string, op: "eq" | "neq" | "gt" | "lt" | "in", value: unknown }
Effect    = { kind: string, params: Record<string, unknown> }
```

## Simulation types (`sim/src/types.ts`)
```ts
type Tick = number                      // integer, 10 per second
type EntityId = string                  // stable and readable: "op.alpha.1", "def.vet.3", "fam.son"
type FloorId = "grounds" | "ground" | "upper" | "roof" | "lower" | "shore" | "hill"
type Pos = { floor: FloorId, x: number, y: number }

type Command =
  | { kind: "move"; tick: Tick; entity: EntityId; to: Pos }          // week 1
  | { kind: "issuePlan"; tick: Tick; plan: Plan }                    // week 2
  | { kind: "decide"; tick: Tick; cardId: string; optionId: string } // week 2
  | { kind: "intervene"; tick: Tick; action: "hold" | "proceed" | "abort" }
  | { kind: "setDoor"; tick: Tick; doorId: string; state: "open" | "closed" | "locked" }

interface EntitySnapshot {
  id: EntityId; side: string; pos: Pos; facing: number;              // facing in integer degrees
  health: number; state: string                                       // "idle" | "moving" | "firing" | "down" ...
}
interface Snapshot { tick: Tick; entities: EntitySnapshot[]; doors: Record<string, string> }

interface SimEventBase { id: string; tick: Tick; type: string; v: 1 }
type SimEvent =
  | SimEventBase & { type: "moved"; entity: EntityId; to: Pos }
  | SimEventBase & { type: "arrived"; entity: EntityId }
  | SimEventBase & { type: "door"; doorId: string; state: string }
  | SimEventBase & { type: "contact"; observer: EntityId; target: EntityId }
  | SimEventBase & { type: "noise"; observer: EntityId; at: Pos; kind: "steps" | "door" | "shot" }
  | SimEventBase & { type: "shot"; shooter: EntityId; at: Pos; hit: boolean }
  | SimEventBase & { type: "down"; entity: EntityId }
  // more types are added in week 2 under the same base

interface Plan {
  id: string; issuedBy: string; intent: string
  tasks: {
    team: string
    action: "move" | "clear" | "hold" | "breach" | "overwatch" | "search" | "extract" | "evacuate"
    target: { roomId?: string; at?: Pos; entity?: EntityId }
    conditions?: string[]
    rules?: string[]
  }[]
}

interface Sim {
  enqueue(cmd: Command): void
  step(): { snapshot: Snapshot; events: SimEvent[] }   // advances exactly one tick
  hash(): string                                        // hash of full state
  serialize(): string
}
createSim(opts: { seed: number; map: MapFile; mission?: Mission }): Sim
```
