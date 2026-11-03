import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { Engine } from "@babylonjs/core/Engines/engine";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Scene } from "@babylonjs/core/scene";
import type { FloorId, MapFile } from "@war-room/content";
import { buildGreybox } from "./greybox/build";
import type { Greybox } from "./greybox/build";
import { FLOOR_KEYS } from "./greybox/plan";
import type { FloorVisibility } from "./greybox/plan";

export interface Viewer {
  greybox: Greybox;
  scene: Scene;
  camera: ArcRotateCamera;
  engine: Engine;
  toggleFloor(floor: FloorId): void;
  dispose(): void;
}

export interface ViewerCallbacks {
  onFloors(visibility: FloorVisibility): void;
  onFps(fps: number): void;
}

/** Engine, scene, camera, lights, and the greybox, for one canvas. */
export function createViewer(canvas: HTMLCanvasElement, map: MapFile, callbacks: ViewerCallbacks): Viewer {
  const engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: false });
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.04, 0.06, 0.09, 1);

  // Look at the middle of the walled estate (map x 50, y 40) from the south, north up the screen.
  const camera = new ArcRotateCamera("camera", -Math.PI / 2, Math.PI / 3, 170, new Vector3(50, 0, 40), scene);
  camera.lowerBetaLimit = 0.1;
  camera.upperBetaLimit = Math.PI / 2 - 0.03;
  camera.lowerRadiusLimit = 8;
  camera.upperRadiusLimit = 320;
  camera.wheelPrecision = 0.6;
  camera.panningSensibility = 40;
  camera.minZ = 0.5;
  camera.maxZ = 1000;
  camera.attachControl(canvas, true);

  const sky = new HemisphericLight("sky", new Vector3(0.3, 1, -0.2), scene);
  sky.intensity = 0.85;
  const sun = new DirectionalLight("sun", new Vector3(-0.5, -1, 0.4), scene);
  sun.intensity = 0.55;

  const greybox = buildGreybox(scene, map);

  const toggleFloor = (floor: FloorId): void => {
    callbacks.onFloors({ ...greybox.toggleFloor(floor) });
  };
  const onKey = (event: KeyboardEvent): void => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const floor = (FLOOR_KEYS as Record<string, FloorId | undefined>)[event.key];
    if (floor) toggleFloor(floor);
  };
  window.addEventListener("keydown", onKey);

  engine.runRenderLoop(() => scene.render());
  const onResize = (): void => engine.resize();
  window.addEventListener("resize", onResize);
  const fpsTimer = window.setInterval(() => callbacks.onFps(engine.getFps()), 500);

  return {
    greybox,
    scene,
    camera,
    engine,
    toggleFloor,
    dispose() {
      window.clearInterval(fpsTimer);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
      greybox.dispose();
      scene.dispose();
      engine.dispose();
    },
  };
}
