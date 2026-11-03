import { Color3 } from "@babylonjs/core/Maths/math.color";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import type { Scene } from "@babylonjs/core/scene";
import type { FloorId, MapFile } from "@war-room/content";
import { MATERIALS, groupBoxes, planGreybox, toggleFloor, zoneRank } from "./plan";
import { allFloorsVisible } from "./plan";
import type { FloorVisibility } from "./plan";

export interface Greybox {
  /** One merged mesh per floor+material group. */
  meshes: Mesh[];
  floorVisible(floor: FloorId): boolean;
  setFloorVisible(floor: FloorId, visible: boolean): void;
  /** Flips one floor and returns the visibility of all four. */
  toggleFloor(floor: FloorId): FloorVisibility;
  dispose(): void;
}

/**
 * Builds the estate from map data. Boxes are merged per floor and material so
 * the whole scene is a few dozen draw calls.
 */
export function buildGreybox(scene: Scene, map: MapFile): Greybox {
  const materials = new Map<string, StandardMaterial>();
  const materialFor = (key: keyof typeof MATERIALS): StandardMaterial => {
    let material = materials.get(key);
    if (!material) {
      const spec = MATERIALS[key];
      material = new StandardMaterial(`greybox-material:${key}`, scene);
      material.diffuseColor = new Color3(...spec.color);
      material.specularColor = Color3.Black();
      material.alpha = spec.alpha;
      material.backFaceCulling = spec.alpha >= 1;
      materials.set(key, material);
    }
    return material;
  };

  const meshes: Mesh[] = [];
  for (const group of groupBoxes(planGreybox(map))) {
    const parts = group.boxes.map((box) => {
      const part = MeshBuilder.CreateBox(
        `part:${box.id}`,
        { width: box.size[0], height: box.size[1], depth: box.size[2] },
        scene,
      );
      part.position.set(box.center[0], box.center[1], box.center[2]);
      return part;
    });
    const merged = Mesh.MergeMeshes(parts, true, true);
    if (!merged) throw new Error(`greybox: nothing to merge for ${group.key}`);
    merged.name = `greybox:${group.key}`;
    merged.material = materialFor(group.material);
    merged.isPickable = false;
    // Translucent zone layers overlap (a path over a garden). Babylon sorts transparent meshes by
    // distance, which is not stable here, so give each kind a fixed draw order.
    const rank = zoneRank(group.material);
    if (rank !== undefined) merged.alphaIndex = 1 + rank;
    merged.metadata = { greybox: true, floor: group.floor, material: group.material };
    meshes.push(merged);
  }

  let visibility: FloorVisibility = allFloorsVisible();
  const apply = (): void => {
    for (const mesh of meshes) mesh.setEnabled(visibility[mesh.metadata.floor as FloorId]);
  };

  return {
    meshes,
    floorVisible: (floor) => visibility[floor],
    setFloorVisible(floor, visible) {
      visibility = { ...visibility, [floor]: visible };
      apply();
    },
    toggleFloor(floor) {
      visibility = toggleFloor(visibility, floor);
      apply();
      return visibility;
    },
    dispose() {
      for (const mesh of meshes) mesh.dispose();
      for (const material of materials.values()) material.dispose();
      meshes.length = 0;
      materials.clear();
    },
  };
}
