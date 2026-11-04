import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { RenderTargetTexture } from "@babylonjs/core/Materials/Textures/renderTargetTexture";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import type { Camera } from "@babylonjs/core/Cameras/camera";
import type { Scene } from "@babylonjs/core/scene";
import { HEAT_BUCKETS, heatBucket, heatForMaterial } from "./heat";

/** The heat of a mesh: units are 1, greybox meshes carry their material key. */
export function meshHeat(mesh: AbstractMesh): number {
  const key = (mesh.metadata as { material?: string; unit?: boolean } | null)?.material ?? ((mesh.metadata as { unit?: boolean } | null)?.unit ? "unit" : "slab");
  return heatForMaterial(key);
}

/** One unlit grey material per heat bucket: brightness = heat. */
export function createHeatMaterials(scene: Scene): Map<number, StandardMaterial> {
  const out = new Map<number, StandardMaterial>();
  for (const h of HEAT_BUCKETS) {
    const m = new StandardMaterial(`heat:${h}`, scene);
    m.disableLighting = true;
    m.emissiveColor = new Color3(h, h, h);
    m.diffuseColor = Color3.Black();
    m.specularColor = Color3.Black();
    out.set(h, m);
  }
  return out;
}

/** Approach (a): an extra render of the scene with every mesh drawn in its heat material. The main scene stays untouched. */
export function createHeatPass(scene: Scene, camera: Camera, meshes: AbstractMesh[], heat: Map<number, StandardMaterial>, width: number, height: number): RenderTargetTexture {
  const rtt = new RenderTargetTexture("heatPass", { width, height }, scene, false);
  rtt.activeCamera = camera;
  rtt.renderList = meshes;
  rtt.clearColor = new Color4(0, 0, 0, 1);
  for (const mesh of meshes) rtt.setMaterialForRendering(mesh, heat.get(heatBucket(meshHeat(mesh)))!);
  return rtt;
}

/** Approach (b): swap every mesh to its heat material in place. Returns a function that restores the originals. */
export function swapToHeat(meshes: AbstractMesh[], heat: Map<number, StandardMaterial>): () => void {
  const originals = meshes.map((m) => ({ m, material: m.material }));
  for (const mesh of meshes) mesh.material = heat.get(heatBucket(meshHeat(mesh)))!;
  return () => {
    for (const { m, material } of originals) m.material = material;
  };
}
