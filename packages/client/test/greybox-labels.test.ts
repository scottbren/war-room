import { describe, expect, it } from "vitest";
import { MapFile } from "@war-room/content";
import charonJson from "../../content/maps/charon.json";
import { planLabels } from "../src/greybox/labels";

const map = MapFile.parse(charonJson);
const labels = planLabels(map);

describe("planLabels", () => {
  it("labels every room except open voids and tiny rooms, once each", () => {
    const rooms = map.floors.flatMap((f) => f.rooms.map((r) => ({ r, f })));
    const wanted = rooms.filter(({ r }) => !r.tags.includes("void") && (r.rect.max.x - r.rect.min.x) * (r.rect.max.y - r.rect.min.y) >= 12);
    expect(labels).toHaveLength(wanted.length);
    expect(new Set(labels.map((l) => l.id)).size).toBe(labels.length);
    expect(labels.some((l) => l.id === "g.panic" && l.text === "Panic room")).toBe(true);
    expect(labels.some((l) => l.id === "u.void")).toBe(false);
  });

  it("puts each label at the room center, just above its floor, in Babylon axes (x, z-up as y, y as z)", () => {
    const panic = labels.find((l) => l.id === "g.panic")!;
    expect(panic.floor).toBe("ground");
    expect(panic.position).toEqual([71, 0.3, 36]);
    const lounge = labels.find((l) => l.id === "u.sky-lounge")!;
    expect(lounge.position[1]).toBeCloseTo(4.3, 10);
    const basement = labels.find((l) => l.id === "l.vault")!;
    expect(basement.position[1]).toBeCloseTo(-3.7, 10);
  });

  it("hides a label while a higher floor covers its center: ground rooms under the upper floor, upper under the roof", () => {
    const get = (id: string) => labels.find((l) => l.id === id)!;
    expect(get("g.panic").hiddenBy).toEqual(["roof", "upper"]);
    expect(get("g.grand-hall").hiddenBy).toEqual(["roof"]); // the upper floor is a void over the hall
    expect(get("u.safe").hiddenBy).toEqual(["roof"]);
    expect(get("r.pavilion").hiddenBy).toEqual([]);
    expect(get("l.vault").hiddenBy).toEqual(["ground", "roof"]); // the upper floor is a void over the vault (under the hall)
    expect(get("g.living").hiddenBy).toEqual(["upper"]); // the terrace over bar C
  });

  it("is deterministic and sorted by floor then id", () => {
    expect(planLabels(map)).toEqual(labels);
    const key = (l: { floor: string; id: string }) => `${l.floor}/${l.id}`;
    expect(labels.map(key)).toEqual([...labels.map(key)].sort());
  });
});
