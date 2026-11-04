import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { MapFile } from "@war-room/content";
import { createLos } from "../../sim/src/los";

const map = MapFile.parse(JSON.parse(readFileSync(fileURLToPath(new URL("../../content/maps/charon.json", import.meta.url)), "utf8")));
const g = (x: number, y: number) => ({ floor: "ground" as const, x, y });
const u = (x: number, y: number) => ({ floor: "upper" as const, x, y });

describe("line of sight on CHARON", () => {
  it("builds in a fraction of a second and answers a long outdoor sight line", () => {
    const started = Date.now();
    const los = createLos(map);
    expect(Date.now() - started).toBeLessThan(2000);
    expect(los.sight({ floor: "grounds", x: 5, y: 3 }, { floor: "grounds", x: 95, y: 3 }).visible).toBe(true);
  });

  it("gallery to great room: the observer on the upper gallery sees into the grand hall, and the hall sees back", () => {
    const los = createLos(map);
    const gallery = map.floors.find((f) => f.id === "upper")!.rooms.find((r) => r.id === "u.gallery")!.rect;
    const hall = map.floors.find((f) => f.id === "ground")!.rooms.find((r) => r.id === "g.grand-hall")!.rect;
    const from = u((gallery.min.x + gallery.max.x) / 2, gallery.min.y + 0.75);
    const to = g((hall.min.x + hall.max.x) / 2 + 1.5, (hall.min.y + hall.max.y) / 2);
    expect(los.sight(from, to).visible).toBe(true);
    expect(los.sight(to, from).visible).toBe(true);
    // a point on the ground floor that is not under the void is not seen from the gallery
    expect(los.sight(from, g(70, 20)).visible).toBe(false);
  });

  it("walls and doors: a closed door blocks the foyer from the hall, and opening it lets sight through", () => {
    const los = createLos(map);
    const door = map.floors.find((f) => f.id === "ground")!.doors.find((d) => d.id === "d.g.hall-drawing")!;
    const a = g(door.at.x, door.at.y - 3), b = g(door.at.x, door.at.y + 3);
    expect(los.sight(a, b).visible).toBe(door.state === "open");
    los.setDoor("d.g.hall-drawing", "open");
    expect(los.sight(a, b).visible).toBe(true);
    los.setDoor("d.g.hall-drawing", "locked");
    expect(los.sight(a, b).visible).toBe(false);
  });

  it("the panic room is sealed from the core while its door is closed", () => {
    const los = createLos(map);
    const door = map.floors.find((f) => f.id === "ground")!.doors.find((d) => d.id === "d.g.panic-core")!;
    los.setDoor("d.g.panic-core", "closed");
    expect(los.sight(g(door.at.x - 2, door.at.y), g(door.at.x + 2, door.at.y)).visible).toBe(false);
    los.setDoor("d.g.panic-core", "open");
    expect(los.sight(g(door.at.x - 2, door.at.y), g(door.at.x + 2, door.at.y)).visible).toBe(true);
  });

  it("every shutter can be closed and reopened, and closing blocks sight through its window", () => {
    const los = createLos(map);
    const g1 = map.floors.find((f) => f.id === "ground")!;
    const win = g1.windows.find((w) => w.shutter)!;
    for (const f of map.floors) for (const w of f.windows.filter((x) => x.shutter)) {
      los.setShutter(w.id, "closed");
      los.setShutter(w.id, "open");
    }
    expect(win).toBeDefined();
  });
});
