import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { MapFile } from "@war-room/content";
import { buildNavGeometry } from "../src/navGeometry";

const map = MapFile.parse(JSON.parse(readFileSync(fileURLToPath(new URL("../../content/maps/charon.json", import.meta.url)), "utf8")));

describe("buildNavGeometry", () => {
  const geo = buildNavGeometry(map);

  it("produces a valid triangle soup: indices in range, multiples of three, finite positions", () => {
    expect(geo.positions.length % 3).toBe(0);
    expect(geo.indices.length % 3).toBe(0);
    const n = geo.positions.length / 3;
    expect(n).toBeGreaterThan(1000);
    for (const i of geo.indices) expect(i).toBeLessThan(n);
    for (const p of geo.positions) expect(Number.isFinite(p)).toBe(true);
  });

  it("has floor surfaces at every floor elevation, with y as height", () => {
    const heights = new Set<number>();
    for (let i = 1; i < geo.positions.length; i += 3) heights.add(Math.round(geo.positions[i]! * 10) / 10);
    for (const e of [-5, -4, 0, 4, 8]) expect(heights.has(e), `elevation ${e}`).toBe(true);
  });

  it("is deterministic: same map, same arrays", () => {
    const again = buildNavGeometry(map);
    expect(again.positions).toEqual(geo.positions);
    expect(again.indices).toEqual(geo.indices);
  });

  it("turns every vertical link into an off-mesh connection at the right heights", () => {
    expect(geo.offMesh).toHaveLength(map.verticalLinks.length);
    const tunnel = geo.offMesh.find((c) => c.id === "link.tunnel")!;
    expect(tunnel.start).toEqual([68, 0, 34]);
    expect(tunnel.end).toEqual([85, -5, 0]);
    expect(tunnel.bidirectional).toBe(true);
    expect(geo.offMesh.find((c) => c.id === "link.shaft")!.bidirectional).toBe(false);
  });

  it("leaves holes in floor slabs for openings (no ground slab over the cellar stairwell)", () => {
    let hit = 0;
    for (let t = 0; t < geo.indices.length; t += 3) {
      const ids = [geo.indices[t]!, geo.indices[t + 1]!, geo.indices[t + 2]!];
      if (!ids.every((i) => geo.positions[i * 3 + 1] === 0)) continue;
      const cx = ids.reduce((s, i) => s + geo.positions[i * 3]!, 0) / 3;
      const cz = ids.reduce((s, i) => s + geo.positions[i * 3 + 2]!, 0) / 3;
      // only flat triangles (floor slabs): all three share a height, and a wall side has differing heights
      if (cx > 25 && cx < 27 && cz > 47 && cz < 54) hit++;
    }
    expect(hit).toBe(0);
  });
});
