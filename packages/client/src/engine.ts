import { Engine } from "@babylonjs/core/Engines/engine";
import { WebGPUEngine } from "@babylonjs/core/Engines/webgpuEngine";
import type { AbstractEngine } from "@babylonjs/core/Engines/abstractEngine";

export type Backend = "webgpu" | "webgl2";

/** WebGPU when the browser has it, else WebGL2. `?gl=webgl2` forces the fallback. */
export async function createEngine(canvas: HTMLCanvasElement): Promise<{ engine: AbstractEngine; backend: Backend }> {
  const forced = new URLSearchParams(window.location.search).get("gl") === "webgl2";
  if (!forced && (await WebGPUEngine.IsSupportedAsync)) {
    try {
      const engine = new WebGPUEngine(canvas, { antialias: true, stencil: false });
      await engine.initAsync();
      return { engine, backend: "webgpu" };
    } catch (e) {
      console.warn("WebGPU init failed, falling back to WebGL2", e);
    }
  }
  return { engine: new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: false }), backend: "webgl2" };
}
