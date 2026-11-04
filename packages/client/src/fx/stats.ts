export interface FrameStats {
  n: number;
  mean: number;
  median: number;
  p95: number;
  max: number;
}

/** Summary of frame times in ms (p95 is nearest-rank). */
export function summarize(samples: readonly number[]): FrameStats {
  if (samples.length === 0) return { n: 0, mean: 0, median: 0, p95: 0, max: 0 };
  const sorted = [...samples].sort((a, b) => a - b);
  const rank = (p: number): number => sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)]!;
  return {
    n: sorted.length,
    mean: sorted.reduce((s, v) => s + v, 0) / sorted.length,
    median: rank(0.5),
    p95: rank(0.95),
    max: sorted.at(-1)!,
  };
}
