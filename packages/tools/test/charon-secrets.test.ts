import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { MapFile } from "@war-room/content";
import type { Floor, Marker } from "@war-room/content";
import { createNav } from "../../sim/src/nav";
import type { Nav } from "../../sim/src/nav";
import type { Pos } from "../../sim/src";

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)));
const map = MapFile.parse(JSON.parse(read("../../content/maps/charon.json").toString("utf8")));
let nav: Nav;
beforeAll(async () => {
  nav = await createNav({ data: new Uint8Array(read("../../content/generated/charon.navmesh.bin")), map });
});

const floor = (id: string): Floor => map.floors.find((f) => f.id === id)!;
const marker = (id: string): Marker => map.markers.find((m) => m.id === id)!;
const tagValue = (m: { tags: string[] }, prefix: string) => m.tags.find((t) => t.startsWith(prefix + ":"))?.slice(prefix.length + 1);
const at = (m: Marker): Pos => ({ floor: m.floor, x: m.at!.x, y: m.at!.y }) as Pos;
const walk = (a: Pos, b: Pos): number => {
  const p = nav.findPath(a, b);
  if (p.length === 0) return Infinity;
  return p.slice(1).reduce((s, q, i) => s + (q.floor === p[i]!.floor ? Math.hypot(q.x - p[i]!.x, q.y - p[i]!.y) : 0), 0);
};

describe("charon: the hidden bookcase door", () => {
  const hidden = map.floors.flatMap((f) => f.doors.filter((d) => d.hidden === true).map((d) => ({ f, d })));

  it("is the only secret door, joining the study to the master suite", () => {
    expect(hidden.map(({ d }) => d.id)).toEqual(["d.g.study-master"]);
    const { d } = hidden[0]!;
    expect(d.between).toEqual(expect.arrayContaining(["g.study", "g.master"]));
    expect(d.kind).toBe("standard");
    expect(d.width).toBeLessThanOrEqual(1.2);
    expect(d.state).toBe("closed");
  });

  it("is a real shortcut for anyone who knows it: the study to the master bed is a few metres, not the long way round", () => {
    const study = marker("m.principal.study"), master = marker("m.principal.master");
    expect(walk(at(study), at(master))).toBeLessThan(14);
  });

  it("is never the only way into either room (operators who do not know it can still plan a route)", () => {
    const doors = (room: string) => floor("ground").doors.filter((d) => d.between.includes(room) && d.hidden !== true);
    expect(doors("g.study").length).toBeGreaterThanOrEqual(1);
    expect(doors("g.master").length).toBeGreaterThanOrEqual(1);
  });

  it("is not lit up by a reader or any device: a secret door has no lock marker", () => {
    for (const m of map.markers) expect(tagValue(m, "door"), m.id).not.toBe("d.g.study-master");
  });
});

describe("charon: the wine cellar keypad", () => {
  const keypad = () => marker("m.auth.l.cellar-corridor.keypad");

  it("locks the basement door to the cellar behind a keypad that fails secure on the house circuit", () => {
    const door = floor("lower").doors.find((d) => d.id === "d.l.cellar-corridor")!;
    expect(door.state).toBe("locked");
    const k = keypad();
    expect(tagValue(k, "auth")).toBe("keypad");
    expect(tagValue(k, "door")).toBe("d.l.cellar-corridor");
    expect(tagValue(k, "fail")).toBe("secure");
    expect(tagValue(k, "circuit")).toBe("c.house.a");
    expect(tagValue(k, "vlan")).toBe("house");
    expect(Number(tagValue(k, "level"))).toBe(2);
  });

  it("stands in the corridor beside the door, not inside the cellar", () => {
    const k = keypad(), door = floor("lower").doors.find((d) => d.id === "d.l.cellar-corridor")!;
    const corridor = floor("lower").rooms.find((r) => r.id === "l.corridor.a")!.rect;
    expect(k.at!.x).toBeGreaterThanOrEqual(corridor.min.x);
    expect(k.at!.x).toBeLessThanOrEqual(corridor.max.x);
    expect(Math.hypot(k.at!.x - door.at.x, k.at!.y - door.at.y)).toBeLessThanOrEqual(2);
  });

  it("leaves the cellar reachable from the library stairs, so the lock guards the basement side only", () => {
    const cellar = floor("lower").rooms.find((r) => r.id === "l.cellar")!.rect;
    const inside = { floor: "lower", x: 22, y: 50 } as Pos;
    expect(cellar.min.x).toBeLessThan(22);
    expect(walk({ floor: "ground", x: 24, y: 50 } as Pos, inside)).toBeLessThan(40);
  });
});

describe("charon: where the family spends the evening (routine spots)", () => {
  const spot = (id: string) => marker(id);

  it("has a spa spot for the wife and a gym spot for the daughter, tagged for the routine system", () => {
    const spa = spot("m.routine.wife.spa"), gym = spot("m.routine.daughter.gym");
    expect(tagValue(spa, "routine")).toBe("spa");
    expect(tagValue(spa, "member")).toBe("wife");
    expect(tagValue(gym, "routine")).toBe("gym");
    expect(tagValue(gym, "member")).toBe("daughter");
    expect(spa.floor).toBe("lower");
    expect(gym.floor).toBe("lower");
  });

  it("puts each spot inside its room, on open floor", () => {
    for (const [id, room] of [["m.routine.wife.spa", "l.spa"], ["m.routine.daughter.gym", "l.gym"]] as const) {
      const m = spot(id), r = floor("lower").rooms.find((x) => x.id === room)!.rect;
      expect(m.at!.x, id).toBeGreaterThan(r.min.x + 0.4);
      expect(m.at!.x, id).toBeLessThan(r.max.x - 0.4);
      expect(m.at!.y, id).toBeGreaterThan(r.min.y + 0.4);
      expect(m.at!.y, id).toBeLessThan(r.max.y - 0.4);
      expect(nav.isWalkable(at(m)), `${id} is walkable`).toBe(true);
    }
  });

  it("can be walked to from the member's bedroom marker, down the stairs", () => {
    for (const [from, to] of [["m.family.wife", "m.routine.wife.spa"], ["m.family.daughter", "m.routine.daughter.gym"]] as const) {
      const d = walk(at(marker(from)), at(spot(to)));
      expect(d, `${from} to ${to}`).toBeLessThan(120);
    }
  });

  it("keeps routine tags out of the family-marker tag group, so the family markers are unchanged", () => {
    expect(map.markers.filter((m) => m.tags.some((t) => t.startsWith("family:"))).map((m) => m.id).sort()).toEqual(["m.family.daughter", "m.family.son", "m.family.wife"]);
  });
});
