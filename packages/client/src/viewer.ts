import "@babylonjs/core/Culling/ray"; // side effect: scene.createPickingRay needs it
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import type { AbstractEngine } from "@babylonjs/core/Engines/abstractEngine";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { Color4 } from "@babylonjs/core/Maths/math.color";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Scene } from "@babylonjs/core/scene";
import type { FloorId, MapFile } from "@war-room/content";
import { buildGreybox } from "./greybox/build";
import type { Greybox } from "./greybox/build";
import { createEngine } from "./engine";
import type { Backend } from "./engine";
import { SimBridge } from "./bridge";
import { floorCandidates } from "./picking";
import { DEMO_OPERATOR } from "./scenario";
import { createUnitLayer } from "./units";
import { planLabels } from "./greybox/labels";
import { FLOOR_KEYS } from "./greybox/plan";
import type { FloorVisibility } from "./greybox/plan";

export interface Viewer {
  greybox: Greybox;
  scene: Scene;
  camera: ArcRotateCamera;
  engine: AbstractEngine;
  backend: Backend;
  bridge: SimBridge;
  toggleFloor(floor: FloorId): void;
  /** Room name labels (key L). */
  toggleLabels(): boolean;
  dispose(): void;
}

export interface ViewerCallbacks {
  onFloors(visibility: FloorVisibility): void;
  onFps(fps: number): void;
  onTick(tick: number): void;
  onError(message: string): void;
}

/** Engine, scene, camera, lights, and the greybox, for one canvas. */
export async function createViewer(canvas: HTMLCanvasElement, map: MapFile, callbacks: ViewerCallbacks): Promise<Viewer> {
  const { engine, backend } = await createEngine(canvas);
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
  // Room labels: DOM overlay, projected each frame; only for visible floors, only in front of the camera.
  const labelLayer = document.createElement("div");
  labelLayer.style.cssText = "position:absolute;inset:0;pointer-events:none;overflow:hidden;font:11px/1.1 system-ui,sans-serif;color:#fff;text-shadow:0 0 3px #000,0 0 3px #000";
  canvas.parentElement?.appendChild(labelLayer);
  const labels = planLabels(map).map((label) => {
    const el = document.createElement("div");
    el.textContent = label.text;
    el.style.cssText = "position:absolute;transform:translate(-50%,-50%);white-space:nowrap;display:none";
    labelLayer.appendChild(el);
    return { label, el, at: new Vector3(...label.position) };
  });
  let labelsOn = true;
  const toggleLabels = (): boolean => {
    labelsOn = !labelsOn;
    return labelsOn;
  };
  const updateLabels = (): void => {
    const transform = scene.getTransformMatrix();
    const viewport = camera.viewport.toGlobal(engine.getRenderWidth(), engine.getRenderHeight());
    const scale = canvas.clientWidth / engine.getRenderWidth();
    for (const { label, el, at } of labels) {
      let show = labelsOn && greybox.floorVisible(label.floor) && camera.radius < 140 && !label.hiddenBy.some((f) => greybox.floorVisible(f));
      if (show) {
        const p = Vector3.Project(at, Matrix.Identity(), transform, viewport);
        show = p.z > 0 && p.z < 1;
        el.style.left = `${p.x * scale}px`;
        el.style.top = `${p.y * scale}px`;
      }
      el.style.display = show ? "block" : "none";
    }
  };
  scene.onBeforeRenderObservable.add(updateLabels);

  const onKey = (event: KeyboardEvent): void => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key === "l" || event.key === "L") toggleLabels();
    const floor = (FLOOR_KEYS as Record<string, FloorId | undefined>)[event.key];
    if (floor) toggleFloor(floor);
  };
  window.addEventListener("keydown", onKey);

  // Simulation in a worker; units drawn from interpolated snapshots.
  const bridge = new SimBridge(new Worker(new URL("./sim.worker.ts", import.meta.url), { type: "module" }) as never, () => performance.now());
  bridge.onError = callbacks.onError;
  bridge.start(1);
  const elevations = Object.fromEntries(map.floors.map((f) => [f.id, f.elevation])) as Record<FloorId, number>;
  const unitLayer = createUnitLayer(scene, elevations, (f) => greybox.floorVisible(f), map.verticalLinks);
  let lastTick = -1;
  scene.onBeforeRenderObservable.add(() => {
    unitLayer.update(bridge.units(performance.now()));
    if (bridge.tick !== lastTick) {
      lastTick = bridge.tick;
      callbacks.onTick(lastTick);
    }
  });

  // A click that is not a drag orders the operator to the clicked spot.
  let downAt: { x: number; y: number } | undefined;
  const onDown = (e: PointerEvent): void => {
    downAt = e.button === 0 ? { x: e.clientX, y: e.clientY } : undefined;
  };
  const onUp = (e: PointerEvent): void => {
    if (!downAt || e.button !== 0 || Math.abs(e.clientX - downAt.x) + Math.abs(e.clientY - downAt.y) > 5) return;
    downAt = undefined;
    const rect = canvas.getBoundingClientRect();
    const ray = scene.createPickingRay(((e.clientX - rect.left) / rect.width) * engine.getRenderWidth(), ((e.clientY - rect.top) / rect.height) * engine.getRenderHeight(), Matrix.Identity(), camera);
    const visible = map.floors.map((f) => f.id).filter((f) => greybox.floorVisible(f));
    const candidates = floorCandidates({ origin: [ray.origin.x, ray.origin.y, ray.origin.z], direction: [ray.direction.x, ray.direction.y, ray.direction.z] }, visible, elevations);
    if (candidates.length > 0) bridge.moveTo(DEMO_OPERATOR, candidates);
  };
  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointerup", onUp);

  engine.runRenderLoop(() => scene.render());
  const onResize = (): void => engine.resize();
  window.addEventListener("resize", onResize);
  const fpsTimer = window.setInterval(() => callbacks.onFps(engine.getFps()), 500);

  return {
    greybox,
    scene,
    camera,
    engine,
    backend,
    bridge,
    toggleFloor,
    toggleLabels,
    dispose() {
      labelLayer.remove();
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointerup", onUp);
      bridge.dispose();
      unitLayer.dispose();
      window.clearInterval(fpsTimer);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
      greybox.dispose();
      scene.dispose();
      engine.dispose();
    },
  };
}
