# Performance notes (T11)

Measured with `packages/client/perf.html` (`pnpm dev`, open `http://localhost:5173/perf.html?auto=1`, add `&gl=webgl2` to force WebGL2; `&show=<id>` displays one configuration instead of measuring, ids: plain, nightVision, grain, fisheye, thermalA, thermalB, helmet1, helmet2, helmetR, combo).

- Machine: Scott's dev PC, NVIDIA GeForce GTX 1060 6GB (ANGLE / Direct3D 11), Chromium driven by Playwright, 2026-11-04.
- Scene: full CHARON greybox (all floors visible, 4 unit capsules), 1920x1080, camera at the default overview.
- Method: each configuration renders 100 warm-up frames, then 300 frames. Every frame is followed by a 1 px `readPixels` so the GPU must finish before the clock stops, and the median frame is kept. The whole list runs 3 times and the best of the 3 round medians is reported. This counts CPU submit time and GPU time together and ignores vsync.
- **Read the numbers as relative cost.** The sync read adds a fixed round trip to every frame: about 1 ms on WebGL2 and about 4.4 ms on WebGPU (its readback is asynchronous). The "plain scene" row is that baseline; the cost of an effect is its row minus the plain row. Timer resolution is 0.1 ms and runs vary by about ±0.3 ms.

| Configuration | WebGL2 ms | extra vs plain | WebGPU ms | extra vs plain |
|---|---:|---:|---:|---:|
| plain scene | 0.9 | 0 | 4.4 | 0 |
| night vision (glow + noise + vignette) | 1.1 | +0.2 | 4.6 | +0.2 |
| grain | 1.0 | +0.1 | 4.7 | +0.3 |
| fisheye | 1.1 | +0.2 | 4.7 | +0.3 |
| thermal (a) replacement pass | 1.6 | +0.7 | 5.3 | +0.9 |
| thermal (b) in-place material swap | 1.0 | +0.1 | 4.5 | +0.1 |
| 4 helmet cams, every frame (320x180) | 2.6 | +1.7 | 7.5 | +3.1 |
| 4 helmet cams, every 2nd frame | 2.3 | +1.4 | 6.5 | +2.1 |
| 4 helmet cams, rotating (one camera per frame) | 1.9 | +1.0 | 5.4 | +1.0 |
| night vision + grain + 4 cams rotating | 1.8 | +0.9 | 5.5 | +1.1 |

All values are the best of three rounds. WebGL2 values are from the final run; WebGPU values are from the run before the helmet overlay was re-spaced (no effect on cost). The renderer string is not reported on WebGPU in this Babylon build, but it is the same machine and GPU.

## What this says
- Every effect, and all four helmet cams every frame, cost under 4 ms extra at 1080p on a GTX 1060 on both backends. The 16.7 ms frame budget (60 fps) is not under pressure from any of them, alone or combined, with this greybox scene. A real scene (lighting, shadows, props) will cost more; re-measure when it exists.
- Helmet cams are the biggest item. Rotating the update (one camera per frame, each camera refreshed every 4th frame) halves their cost; it is the setting to use.
- WebGPU shows no speed advantage for this scene; both are fine.

## Not measured: vsynced frame pacing
The page also records a requestAnimationFrame loop (the "paced" columns in the page output), but the automated browser throttled animation frames to about 1 per second, so those numbers are meaningless here. To get real fps and p95 frame times, open the page in a normal, focused Chrome window on the dev PC and copy the "DONE. JSON" line. Not needed to pick an approach; wanted as a sanity check.

## Known quirks
- WebGPU logs "Destroyed texture used in a submit" warnings when the page calls `beginFrame/endFrame` itself (only the measurement page does; the game uses the engine render loop). It does not affect output.
