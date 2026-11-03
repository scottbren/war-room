import { describe, expect, it } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MapFile } from "@war-room/content";
import charonJson from "../../content/maps/charon.json";
import { buildGreybox } from "../src/greybox/build";
import { groupBoxes, planGreybox } from "../src/greybox/plan";

const map = MapFile.parse(charonJson);

function setup() {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const greybox = buildGreybox(scene, map);
  return { engine, scene, greybox };
}

describe("buildGreybox (headless Babylon)", () => {
  it("makes exactly one merged mesh per floor+material group, with real geometry", () => {
    const { scene, greybox } = setup();
    const groups = groupBoxes(planGreybox(map));
    expect(greybox.meshes).toHaveLength(groups.length);
    expect(scene.meshes.filter((m) => m.metadata?.greybox)).toHaveLength(groups.length);
    for (const mesh of greybox.meshes) {
      expect(mesh.getTotalVertices(), mesh.name).toBeGreaterThan(0);
      expect(mesh.isPickable).toBe(false);
    }
    expect(new Set(greybox.meshes.map((m) => m.name)).size).toBe(greybox.meshes.length);
  });

  it("tags each mesh with its floor and makes translucent materials see-through", () => {
    const { greybox } = setup();
    for (const mesh of greybox.meshes) {
      expect(["grounds", "ground", "upper", "roof"]).toContain(mesh.metadata.floor);
    }
    const glass = greybox.meshes.find((m) => m.name.includes("wall:glass"));
    expect(glass?.material?.alpha).toBeLessThan(1);
    const pool = greybox.meshes.find((m) => m.name.includes("zone:pool"));
    expect(pool?.material?.alpha).toBeLessThan(1);
  });

  it("draws translucent zone layers in a fixed order (lawn, garden, path, pool, sea), whatever the camera does", () => {
    const { greybox } = setup();
    const order = (kind: string) => {
      const mesh = greybox.meshes.find((m) => m.name.endsWith(`zone:${kind}`) && m.metadata.floor === "grounds");
      if (!mesh) throw new Error(`no zone mesh for ${kind}`);
      return mesh.alphaIndex;
    };
    expect(order("lawn")).toBeLessThan(order("garden"));
    expect(order("garden")).toBeLessThan(order("terrace")); // a path over a garden must show
    expect(order("terrace")).toBeLessThan(order("pool")); // a pond over both
    expect(order("pool")).toBeLessThan(order("sea"));
  });

  it("puts the map in Babylon space as (x, z, y): up is map z, depth is map y", () => {
    const { scene } = setup();
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const m of scene.meshes) {
      m.computeWorldMatrix(true);
      const { minimumWorld: lo, maximumWorld: hi } = m.getBoundingInfo().boundingBox;
      minX = Math.min(minX, lo.x); maxX = Math.max(maxX, hi.x);
      minY = Math.min(minY, lo.y); maxY = Math.max(maxY, hi.y);
      minZ = Math.min(minZ, lo.z); maxZ = Math.max(maxZ, hi.z);
    }
    expect(minX).toBeCloseTo(-40, 0);
    expect(maxX).toBeCloseTo(140, 0);
    expect(minZ).toBeCloseTo(-40, 0); // map y = -40 (the sea)
    expect(maxZ).toBeCloseTo(94, 0); // map y = 94 (the highway)
    expect(maxY).toBeGreaterThan(8); // the roof parapet and everything above it
    expect(maxY).toBeLessThan(16); // the comm mast (6 m) on the 8 m roof is the tallest thing
    expect(minY).toBeLessThan(0);
  });

  it("shows and hides a whole floor without touching the others", () => {
    const { greybox } = setup();
    const enabled = (floor: string) => greybox.meshes.filter((m) => m.metadata.floor === floor).map((m) => m.isEnabled());

    expect(greybox.floorVisible("upper")).toBe(true);
    greybox.setFloorVisible("upper", false);
    expect(greybox.floorVisible("upper")).toBe(false);
    expect(enabled("upper").every((e) => !e)).toBe(true);
    for (const other of ["grounds", "ground", "roof"]) expect(enabled(other).every(Boolean), other).toBe(true);

    greybox.setFloorVisible("upper", true);
    expect(enabled("upper").every(Boolean)).toBe(true);
  });

  it("toggles via toggleFloor and reports the new state of all floors", () => {
    const { greybox } = setup();
    expect(greybox.toggleFloor("roof")).toEqual({ grounds: true, ground: true, upper: true, roof: false });
    expect(greybox.toggleFloor("roof")).toEqual({ grounds: true, ground: true, upper: true, roof: true });
  });

  it("dispose removes every mesh it made", () => {
    const { scene, greybox } = setup();
    greybox.dispose();
    expect(scene.meshes.filter((m) => (m as Mesh).metadata?.greybox)).toHaveLength(0);
  });
});
