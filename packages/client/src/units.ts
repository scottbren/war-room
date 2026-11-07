import { CreateCapsule } from "@babylonjs/core/Meshes/Builders/capsuleBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Scene } from "@babylonjs/core/scene";
import type { FloorId, MapFile } from "@war-room/content";
import type { RenderUnit } from "./bridge";
import { woundColor, woundOf } from "./combatFx";
import type { Wound } from "./combatFx";
import { stairLift } from "./stairs";

const SIDE_COLORS: Record<string, [number, number, number]> = {
  operator: [0.2, 0.6, 1],
  hostile: [0.9, 0.2, 0.2],
  defender: [0.9, 0.2, 0.2],
  principal: [0.7, 0.3, 0.9],
  family: [0.95, 0.55, 0.75],
  civilian: [0.9, 0.85, 0.3],
};
const HEIGHT = 1.8;

/** Capsules for units, colored by side, created on first sight and moved each frame. */
export function createUnitLayer(
  scene: Scene,
  elevations: Readonly<Record<FloorId, number>>,
  floorVisible: (f: FloorId) => boolean,
  links: readonly MapFile["verticalLinks"][number][] = [],
) {
  const meshes = new Map<string, Mesh>();
  const materials = new Map<string, StandardMaterial>();
  const material = (side: string, wound: Wound): StandardMaterial => {
    const key = `${side}.${wound}`;
    let m = materials.get(key);
    if (!m) {
      m = new StandardMaterial(`unit.${key}`, scene);
      m.diffuseColor = new Color3(...woundColor(SIDE_COLORS[side] ?? [0.7, 0.7, 0.7], wound));
      m.emissiveColor = m.diffuseColor.scale(0.35);
      materials.set(key, m);
    }
    return m;
  };
  return {
    update(units: readonly RenderUnit[]): void {
      const seen = new Set<string>();
      for (const u of units) {
        seen.add(u.id);
        let mesh = meshes.get(u.id);
        if (!mesh) {
          mesh = CreateCapsule(`unit.${u.id}`, { height: HEIGHT, radius: 0.3 }, scene);
          mesh.isPickable = false;
          meshes.set(u.id, mesh);
        }
        // Map (x, y) -> Babylon (x, z); capsule origin is its centre.
        // A downed unit lies on the floor.
        const down = u.state === "down";
        mesh.material = material(u.side, u.ghost ? "healthy" : woundOf(u.health, down));
        mesh.rotation.x = down ? Math.PI / 2 : 0;
        mesh.position.set(u.x, elevations[u.floor] + stairLift(links, elevations, u.floor, u.x, u.y) + (down ? 0.3 : HEIGHT / 2), u.y);
        mesh.visibility = u.ghost ? 0.35 : 1;
        mesh.setEnabled(floorVisible(u.floor));
      }
      for (const [id, mesh] of meshes) {
        if (!seen.has(id)) {
          mesh.dispose();
          meshes.delete(id);
        }
      }
    },
    position(id: string): { x: number; y: number; z: number } | undefined {
      const m = meshes.get(id);
      return m && { x: m.position.x, y: m.position.y, z: m.position.z };
    },
    dispose(): void {
      for (const m of meshes.values()) m.dispose();
      for (const m of materials.values()) m.dispose();
    },
  };
}
