import type { AbstractEngine } from "@babylonjs/core/Engines/abstractEngine";
import { ShaderStore } from "@babylonjs/core/Engines/shaderStore";
import { ShaderLanguage } from "@babylonjs/core/Materials/shaderLanguage";
import type { Camera } from "@babylonjs/core/Cameras/camera";
import type { Effect } from "@babylonjs/core/Materials/effect";
import { PostProcess } from "@babylonjs/core/PostProcesses/postProcess";

/**
 * Camera effects as full-screen post-processes. Each shader exists twice (GLSL for WebGL2, WGSL for WebGPU) under the
 * same name, so the same effect list works on both backends.
 */
export type EffectName = "nightVision" | "grain" | "fisheye" | "thermal" | "thermalMap";

const GLSL_HEAD = `varying vec2 vUV; uniform sampler2D textureSampler; uniform float time; uniform vec2 texel;
float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }`;
const WGSL_HEAD = `varying vUV: vec2f; var textureSamplerSampler: sampler; var textureSampler: texture_2d<f32>;
uniform time: f32; uniform texel: vec2f;
fn hash(p: vec2f) -> f32 { return fract(sin(dot(p, vec2f(12.9898, 78.233))) * 43758.5453); }
fn tex(uv: vec2f) -> vec3f { return textureSample(textureSampler, textureSamplerSampler, uv).rgb; }`;

const SOURCES: Record<EffectName, { glsl: string; wgsl: string }> = {
  // Green phosphor: luminance boosted, soft 4-tap glow, per-pixel noise, vignette.
  nightVision: {
    glsl: `${GLSL_HEAD}
void main(void) {
  vec3 c = texture2D(textureSampler, vUV).rgb;
  vec3 glow = texture2D(textureSampler, vUV + vec2(texel.x * 4.0, 0.0)).rgb + texture2D(textureSampler, vUV - vec2(texel.x * 4.0, 0.0)).rgb
            + texture2D(textureSampler, vUV + vec2(0.0, texel.y * 4.0)).rgb + texture2D(textureSampler, vUV - vec2(0.0, texel.y * 4.0)).rgb;
  float l = dot(c + glow * 0.25, vec3(0.3, 0.59, 0.11));
  l = pow(clamp(l * 1.3, 0.0, 1.0), 0.75) + (hash(vUV * vec2(1920.0, 1080.0) + time) - 0.5) * 0.14;
  float vig = 1.0 - smoothstep(0.55, 0.95, length(vUV - 0.5) * 1.4);
  gl_FragColor = vec4(vec3(0.12, 1.0, 0.28) * max(l, 0.0) * vig, 1.0);
}`,
    wgsl: `${WGSL_HEAD}
@fragment
fn main(input: FragmentInputs) -> FragmentOutputs {
  let c = tex(input.vUV);
  let glow = tex(input.vUV + vec2f(uniforms.texel.x * 4.0, 0.0)) + tex(input.vUV - vec2f(uniforms.texel.x * 4.0, 0.0))
           + tex(input.vUV + vec2f(0.0, uniforms.texel.y * 4.0)) + tex(input.vUV - vec2f(0.0, uniforms.texel.y * 4.0));
  var l = dot(c + glow * 0.25, vec3f(0.3, 0.59, 0.11));
  l = pow(clamp(l * 1.3, 0.0, 1.0), 0.75) + (hash(input.vUV * vec2f(1920.0, 1080.0) + uniforms.time) - 0.5) * 0.14;
  let vig = 1.0 - smoothstep(0.55, 0.95, length(input.vUV - 0.5) * 1.4);
  fragmentOutputs.color = vec4f(vec3f(0.12, 1.0, 0.28) * max(l, 0.0) * vig, 1.0);
}`,
  },
  grain: {
    glsl: `${GLSL_HEAD}
void main(void) {
  vec3 c = texture2D(textureSampler, vUV).rgb;
  float n = hash(vUV * vec2(1920.0, 1080.0) + time) - 0.5;
  gl_FragColor = vec4(c + n * 0.09, 1.0);
}`,
    wgsl: `${WGSL_HEAD}
@fragment
fn main(input: FragmentInputs) -> FragmentOutputs {
  let c = tex(input.vUV);
  let n = hash(input.vUV * vec2f(1920.0, 1080.0) + uniforms.time) - 0.5;
  fragmentOutputs.color = vec4f(c + n * 0.09, 1.0);
}`,
  },
  // Barrel distortion; outside the lens is black.
  fisheye: {
    glsl: `${GLSL_HEAD}
void main(void) {
  vec2 p = vUV - 0.5;
  vec2 uv = 0.5 + p * (1.0 + 1.1 * dot(p, p));
  float inside = step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
  gl_FragColor = vec4(texture2D(textureSampler, uv).rgb * inside, 1.0);
}`,
    wgsl: `${WGSL_HEAD}
@fragment
fn main(input: FragmentInputs) -> FragmentOutputs {
  let p = input.vUV - 0.5;
  let uv = 0.5 + p * (1.0 + 1.1 * dot(p, p));
  let inside = step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
  fragmentOutputs.color = vec4f(tex(clamp(uv, vec2f(0.0), vec2f(1.0))) * inside, 1.0);
}`,
  },
  // White-hot: the scene is rendered with heat as brightness (see thermal.ts); this maps it to a contrasty grey with sensor noise.
  thermal: {
    glsl: `${GLSL_HEAD}
void main(void) {
  float h = texture2D(textureSampler, vUV).r;
  h = smoothstep(0.04, 0.95, h) + (hash(vUV * vec2(1920.0, 1080.0) + time) - 0.5) * 0.04;
  gl_FragColor = vec4(vec3(clamp(h, 0.0, 1.0)), 1.0);
}`,
    wgsl: `${WGSL_HEAD}
@fragment
fn main(input: FragmentInputs) -> FragmentOutputs {
  var h = tex(input.vUV).r;
  h = smoothstep(0.04, 0.95, h) + (hash(input.vUV * vec2f(1920.0, 1080.0) + uniforms.time) - 0.5) * 0.04;
  fragmentOutputs.color = vec4f(vec3f(clamp(h, 0.0, 1.0)), 1.0);
}`,
  },
  // Same grey mapping, but reads the heat image from a second texture (approach (a): a replacement-material pass).
  thermalMap: {
    glsl: `${GLSL_HEAD}
uniform sampler2D heatSampler;
void main(void) {
  float h = texture2D(heatSampler, vUV).r;
  h = smoothstep(0.04, 0.95, h) + (hash(vUV * vec2(1920.0, 1080.0) + time) - 0.5) * 0.04;
  gl_FragColor = vec4(vec3(clamp(h, 0.0, 1.0)), 1.0);
}`,
    wgsl: `${WGSL_HEAD}
var heatSamplerSampler: sampler; var heatSampler: texture_2d<f32>;
@fragment
fn main(input: FragmentInputs) -> FragmentOutputs {
  var h = textureSample(heatSampler, heatSamplerSampler, input.vUV).r;
  h = smoothstep(0.04, 0.95, h) + (hash(input.vUV * vec2f(1920.0, 1080.0) + uniforms.time) - 0.5) * 0.04;
  fragmentOutputs.color = vec4f(vec3f(clamp(h, 0.0, 1.0)), 1.0);
}`,
  },
};

const shaderName = (name: EffectName): string => `wr_${name}`;

let registered = false;
function registerShaders(): void {
  if (registered) return;
  registered = true;
  for (const name of Object.keys(SOURCES) as EffectName[]) {
    ShaderStore.ShadersStore[`${shaderName(name)}PixelShader`] = SOURCES[name].glsl;
    ShaderStore.ShadersStoreWGSL[`${shaderName(name)}PixelShader`] = SOURCES[name].wgsl;
  }
}

/** A full-screen effect on a camera. Time and texel size are filled in each frame. */
export function createEffect(name: EffectName, engine: AbstractEngine, camera: Camera, isWebGPU: boolean, now: () => number, extra?: { samplers: string[]; bind(effect: Effect): void }): PostProcess {
  registerShaders();
  const pp = new PostProcess(`fx.${name}`, shaderName(name), {
    uniforms: ["time", "texel"],
    samplers: extra?.samplers,
    camera,
    engine,
    samplingMode: 1,
    shaderLanguage: isWebGPU ? ShaderLanguage.WGSL : ShaderLanguage.GLSL,
  });
  pp.onApplyObservable.add((effect) => {
    effect.setFloat("time", (now() % 1000) / 1000);
    effect.setFloat2("texel", 1 / pp.width, 1 / pp.height);
    extra?.bind(effect);
  });
  return pp;
}
