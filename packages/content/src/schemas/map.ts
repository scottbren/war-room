import { z } from "zod";
import { Angle, FloorId, Rect, Vec2 } from "./common";

const Id = z.string().min(1);

export const Room = z
  .object({
    id: Id, // "g.study", "u.son"
    name: z.string().min(1),
    rect: Rect, // axis-aligned only for the slice
    ceiling: z.number().positive(), // meters; 8 for double height
    tags: z.array(z.string()), // "interior", "exterior", "panic-room", "family", "objective"
  })
  .strict();
export type Room = z.infer<typeof Room>;

export const Wall = z
  .object({
    id: Id,
    a: Vec2,
    b: Vec2,
    thickness: z.number().positive(),
    height: z.number().positive(),
    material: z.enum(["reinforced", "stone", "plaster", "glass", "perimeter"]),
    destructible: z.boolean(),
  })
  .strict();
export type Wall = z.infer<typeof Wall>;

const RoomRef = z.union([Id, z.literal("outside")]);

export const Door = z
  .object({
    id: Id,
    at: Vec2, // center of the doorway, on a wall line
    width: z.number().positive(),
    between: z.tuple([RoomRef, RoomRef]),
    kind: z.enum(["standard", "glass", "blast", "gate", "shutter"]),
    state: z.enum(["open", "closed", "locked"]),
    breach: z.array(z.enum(["manual", "shotgun", "explosive", "thermal-lance", "hack"])),
  })
  .strict();
export type Door = z.infer<typeof Door>;

export const Window = z
  .object({
    id: Id,
    at: Vec2,
    width: z.number().positive(),
    between: z.tuple([RoomRef, RoomRef]),
    shutter: z.boolean(),
    blastRated: z.boolean(),
  })
  .strict();
export type Window = z.infer<typeof Window>;

export const Opening = z
  .object({
    id: Id,
    rect: Rect,
    kind: z.literal("gallery-void"), // see and shoot through to the floor below
    below: FloorId,
  })
  .strict();
export type Opening = z.infer<typeof Opening>;

export const Cover = z
  .object({
    id: Id,
    rect: Rect,
    type: z.enum(["heavy", "light", "concealment"]),
    height: z.number().positive(), // low cover < 1.2 m
    facing: z.union([Angle, z.literal("all")]),
    destructible: z.boolean(),
  })
  .strict();
export type Cover = z.infer<typeof Cover>;

export const Floor = z
  .object({
    id: FloorId,
    elevation: z.number(), // meters
    rooms: z.array(Room),
    walls: z.array(Wall), // derived by tools/derive-walls, then committed
    doors: z.array(Door),
    windows: z.array(Window),
    openings: z.array(Opening),
    cover: z.array(Cover),
  })
  .strict();
export type Floor = z.infer<typeof Floor>;

const LinkEnd = z.object({ floor: FloorId, at: Vec2 }).strict();

export const VerticalLink = z
  .object({
    id: Id,
    kind: z.enum(["stairs", "shaft", "roof-access", "cliff-path", "fast-rope"]),
    from: LinkEnd,
    to: LinkEnd,
    bidirectional: z.boolean(),
    restrictedTo: z.array(z.enum(["defender", "principal", "operator"])).optional(),
  })
  .strict();
export type VerticalLink = z.infer<typeof VerticalLink>;

export const Zone = z
  .object({
    id: Id,
    floor: FloorId,
    rect: Rect,
    kind: z.enum(["exposed", "pool", "garden", "marina", "sea", "road", "lawn", "terrace"]),
  })
  .strict();
export type Zone = z.infer<typeof Zone>;

export const Marker = z
  .object({
    id: Id,
    floor: FloorId,
    kind: z.enum(["spawn", "guard-post", "patrol", "poi", "lz", "approach"]),
    at: Vec2.optional(),
    path: z.array(Vec2).optional(), // for patrols
    tags: z.array(z.string()), // "approach:A", "poi:drive", "guard:veteran"
  })
  .strict();
export type Marker = z.infer<typeof Marker>;

export const MapFile = z
  .object({
    id: Id, // "charon"
    version: z.number().int().positive(), // bump on any change
    bounds: Rect,
    floors: z.array(Floor),
    verticalLinks: z.array(VerticalLink),
    zones: z.array(Zone),
    markers: z.array(Marker),
  })
  .strict();
export type MapFile = z.infer<typeof MapFile>;
