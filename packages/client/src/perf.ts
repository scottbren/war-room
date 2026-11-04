import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { RenderTargetTexture } from "@babylonjs/core/Materials/Textures/renderTargetTexture";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { CreateCapsule } from "@babylonjs/core/Meshes/Builders/capsuleBuilder";
import { CreatePlane } from "@babylonjs/core/Meshes/Builders/planeBuilder";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { PostProcess } from "@babylonjs/core/PostProcesses/postProcess";
import { Scene } from "@babylonjs/core/scene";
import { MapFile } from "@war-room/content";
import charonJson from "../../content/maps/charon.json";
import { createEngine } from "./engine";
import { createEffect } from "./fx/effects";
import type { EffectName } from "./fx/effects";
import { summarize } from "./fx/stats";
import { createHeatMaterials, createHeatPass, swapToHeat } from "./fx/thermal";
import { buildGreybox } from "./greybox/build";

/** T11 measurement page: frame cost of each camera effect and of helmet cams, on whichever backend the browser gives us. */
type Config = { id: string; label: string; apply(): () => void };

const out = document.getElementById("out") as HTMLPreElement;
const log = (text: string): void => {
  out.textContent += `\n${text}`;
};

async function main(): Promise<void> {
  out.textContent = "starting engine...";
  const canvas = document.getElementById("c") as HTMLCanvasElement;
  const { engine, backend } = await createEngine(canvas);
  const isWebGPU = backend === "webgpu";
  engine.setSize(1920, 1080); // measure at 1080p whatever the window size
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.04, 0.06, 0.09, 1);
  const camera = new ArcRotateCamera("camera", -Math.PI / 2, Math.PI / 3, 150, new Vector3(50, 0, 40), scene);
  camera.minZ = 0.5;
  camera.maxZ = 1000;
  new HemisphericLight("sky", new Vector3(0.3, 1, -0.2), scene).intensity = 0.85;
  new DirectionalLight("sun", new Vector3(-0.5, -1, 0.4), scene).intensity = 0.55;
  const greybox = buildGreybox(scene, MapFile.parse(charonJson));

  // Four operators (static) in view of the helmet cams: [map x, map y, elevation, yaw].
  const spots: [number, number, number, number][] = [
    [48, 68, 0, 0],
    [54, 50, 0, 1.6],
    [30, 40, 0, 3.1],
    [76, 62, 0, 4.7],
  ];
  const unitMat = new StandardMaterial("unit", scene);
  unitMat.diffuseColor = new Color3(0.2, 0.6, 1);
  const units = spots.map(([x, z, y], i) => {
    const m = CreateCapsule(`unit.${i}`, { height: 1.8, radius: 0.3 }, scene);
    m.material = unitMat;
    m.position.set(x, y + 0.9, z);
    m.metadata = { unit: true };
    return m;
  });
  const world: AbstractMesh[] = [...greybox.meshes, ...units];

  const now = (): number => performance.now();
  const withEffect = (names: EffectName[], extra?: Parameters<typeof createEffect>[5]): (() => void) => {
    const pps: PostProcess[] = names.map((n) => createEffect(n, engine, camera, isWebGPU, now, extra));
    return () => pps.forEach((p) => p.dispose(camera));
  };

  const heatMats = createHeatMaterials(scene);

  // Helmet cams: 320x180 render targets shown in a 2x2 overlay parented to the main camera.
  const helmet = (refresh: "every" | "half" | "rotate"): (() => void) => {
    const rtts: RenderTargetTexture[] = [];
    const cams: FreeCamera[] = [];
    const planes: AbstractMesh[] = [];
    spots.forEach(([x, z, y, yaw], i) => {
      const cam = new FreeCamera(`helmet.${i}`, new Vector3(x, y + 1.6, z), scene);
      cam.rotation.y = yaw;
      cam.minZ = 0.2;
      cam.maxZ = 200;
      cams.push(cam);
      const rtt = new RenderTargetTexture(`helmet.rtt.${i}`, { width: 320, height: 180 }, scene, false);
      rtt.activeCamera = cam;
      rtt.renderList = world;
      rtt.refreshRate = refresh === "every" ? 1 : refresh === "half" ? 2 : RenderTargetTexture.REFRESHRATE_RENDER_ONCE;
      scene.customRenderTargets.push(rtt);
      rtts.push(rtt);
      const plane = CreatePlane(`helmet.plane.${i}`, { width: 0.46, height: 0.26 }, scene);
      plane.parent = camera;
      plane.position.set(0.78 + (i % 2) * 0.48, 0.68 - Math.floor(i / 2) * 0.3, 2);
      plane.renderingGroupId = 1;
      plane.isPickable = false;
      const mat = new StandardMaterial(`helmet.mat.${i}`, scene);
      mat.disableLighting = true;
      mat.emissiveTexture = rtt;
      mat.backFaceCulling = false;
      plane.material = mat;
      planes.push(plane);
    });
    let frame = 0;
    const observer = scene.onBeforeRenderObservable.add(() => {
      cams.forEach((c, i) => (c.rotation.y = spots[i]![3] + (frame % 600) * 0.002));
      if (refresh === "rotate") rtts[frame % 4]!.resetRefreshCounter();
      frame++;
    });
    return () => {
      scene.onBeforeRenderObservable.remove(observer);
      for (const rtt of rtts) {
        scene.customRenderTargets.splice(scene.customRenderTargets.indexOf(rtt), 1);
        rtt.dispose();
      }
      planes.forEach((p) => {
        p.material?.dispose();
        p.dispose();
      });
      cams.forEach((c) => c.dispose());
    };
  };

  const configs: Config[] = [
    { id: "plain", label: "plain scene", apply: () => () => undefined },
    { id: "nightVision", label: "night vision", apply: () => withEffect(["nightVision"]) },
    { id: "grain", label: "grain", apply: () => withEffect(["grain"]) },
    { id: "fisheye", label: "fisheye", apply: () => withEffect(["fisheye"]) },
    {
      id: "thermalA",
      label: "thermal (a) replacement pass",
      apply: () => {
        const rtt = createHeatPass(scene, camera, world, heatMats, engine.getRenderWidth(), engine.getRenderHeight());
        scene.customRenderTargets.push(rtt);
        const undo = withEffect(["thermalMap"], { samplers: ["heatSampler"], bind: (e) => e.setTexture("heatSampler", rtt) });
        return () => {
          undo();
          scene.customRenderTargets.splice(scene.customRenderTargets.indexOf(rtt), 1);
          rtt.dispose();
        };
      },
    },
    {
      id: "thermalB",
      label: "thermal (b) in-place material swap",
      apply: () => {
        const restore = swapToHeat(world, heatMats);
        const undo = withEffect(["thermal"]);
        return () => {
          undo();
          restore();
        };
      },
    },
    { id: "helmet1", label: "4 helmet cams, every frame", apply: () => helmet("every") },
    { id: "helmet2", label: "4 helmet cams, every 2nd frame", apply: () => helmet("half") },
    { id: "helmetR", label: "4 helmet cams, rotating (1 per frame)", apply: () => helmet("rotate") },
    {
      id: "combo",
      label: "night vision + grain + 4 cams rotating",
      apply: () => {
        const a = withEffect(["nightVision", "grain"]);
        const b = helmet("rotate");
        return () => {
          b();
          a();
        };
      },
    },
  ];

  const renderOnce = (): void => {
    engine.beginFrame();
    scene.render();
    engine.endFrame();
  };
  const flush = async (): Promise<void> => {
    await engine.readPixels(0, 0, 1, 1);
  };

  /**
   * Frame cost with the GPU forced to finish every frame (a 1 px read after each render), so CPU submit time and GPU time
   * both count and nothing hides in the driver queue. Median ms over `frames` frames.
   */
  const burst = async (frames: number): Promise<number> => {
    await flush();
    const times: number[] = [];
    for (let i = 0; i < frames; i++) {
      const t0 = performance.now();
      renderOnce();
      await flush();
      times.push(performance.now() - t0);
    }
    return summarize(times).median;
  };

  /** Normal vsynced loop: per-frame times from requestAnimationFrame. */
  const paced = (frames: number): Promise<number[]> =>
    new Promise((resolve) => {
      const times: number[] = [];
      let last = 0;
      // A throttled tab (minimised, hidden) can run at 1 fps; report what was collected after 2.5 s instead of waiting.
      const giveUp = window.setTimeout(() => {
        engine.stopRenderLoop();
        resolve(times);
      }, 2500);
      engine.runRenderLoop(() => {
        scene.render();
        const t = performance.now();
        if (last) times.push(t - last);
        last = t;
        if (times.length >= frames) {
          window.clearTimeout(giveUp);
          engine.stopRenderLoop();
          resolve(times);
        }
      });
    });

  // ?show=<config id> just displays one configuration (to look at an effect) instead of measuring.
  const show = new URLSearchParams(location.search).get("show");
  if (show) {
    const cfg = configs.find((c) => c.id === show);
    if (!cfg) throw new Error(`unknown config: ${show}`);
    cfg.apply();
    engine.runRenderLoop(() => scene.render());
    out.textContent = `showing ${cfg.label} on ${backend}`;
    return;
  }

  const info = (engine as unknown as { getGlInfo?(): { renderer: string; vendor: string } }).getGlInfo?.() ?? { renderer: "unknown", vendor: "unknown" };
  const header = { backend, renderer: info.renderer, vendor: info.vendor, width: engine.getRenderWidth(), height: engine.getRenderHeight(), userAgent: navigator.userAgent };
  out.textContent = `backend ${backend} | ${info.renderer} | ${engine.getRenderWidth()}x${engine.getRenderHeight()}
ms per frame with the GPU forced to finish each frame: best of 3 rounds (median within a round) | vsynced loop median / p95`;
  const rounds = 3;
  const sync = new Map<string, number[]>();
  const paced0 = new Map<string, { median: number; p95: number; fps: number }>();
  for (let round = 0; round < rounds; round++) {
    for (const cfg of configs) {
      const undo = cfg.apply();
      for (let i = 0; i < 20; i++) renderOnce(); // compile shaders and warm up
      await flush();
      await burst(100); // let the GPU clock settle on this workload
      sync.set(cfg.id, [...(sync.get(cfg.id) ?? []), await burst(300)]);
      if (round === 0) {
        const stats = summarize(await paced(120));
        paced0.set(cfg.id, { median: stats.median, p95: stats.p95, fps: 1000 / (stats.mean || 1) });
      }
      undo();
    }
    log(`round ${round + 1} of ${rounds} done`);
  }
  const results = configs.map((cfg) => {
    const runs = sync.get(cfg.id)!;
    const p = paced0.get(cfg.id)!;
    return { id: cfg.id, label: cfg.label, bestMs: Math.min(...runs), medianMs: summarize(runs).median, pacedMedianMs: p.median, pacedP95Ms: p.p95, pacedFps: p.fps };
  });
  for (const r of results) {
    log(`${r.label.padEnd(40)} | ${r.bestMs.toFixed(2).padStart(6)} best, ${r.medianMs.toFixed(2).padStart(6)} median | ${r.pacedMedianMs.toFixed(1)} / ${r.pacedP95Ms.toFixed(1)}`);
  }
  (window as unknown as { __perfResults: unknown }).__perfResults = { header, results };
  const compact = results.map((r) => [r.id, Number(r.bestMs.toFixed(2)), Number(r.medianMs.toFixed(2)), Number(r.pacedMedianMs.toFixed(1)), Number(r.pacedP95Ms.toFixed(1))]);
  log(`\nDONE. JSON: ${JSON.stringify({ backend, renderer: info.renderer, results: compact })}`);
}

const start = (): void => {
  main().catch((e: unknown) => {
    out.textContent += `\nERROR: ${e instanceof Error ? (e.stack ?? e.message) : String(e)}`;
    (window as unknown as { __perfError: string }).__perfError = String(e);
  });
};
document.getElementById("run")?.addEventListener("click", start);
if (new URLSearchParams(location.search).get("auto") === "1") start();
