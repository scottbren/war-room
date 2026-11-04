/** How hot each kind of surface looks in the thermal view (0 = cold, 1 = body heat). */
const HEAT: Record<string, number> = {
  unit: 1,
  "cover:concealment": 0.3,
  "window:glass": 0.2,
  "wall:glass": 0.2,
  "zone:pool": 0.1,
  "zone:sea": 0.05,
  "zone:marina": 0.08,
  "zone:road": 0.3,
  "zone:exposed": 0.35,
  "zone:garden": 0.15,
  terrain: 0.12,
  slab: 0.3,
};

/** Heat for a greybox material key (or "unit"); defaults to plain slab. */
export function heatForMaterial(key: string): number {
  return Object.hasOwn(HEAT, key) ? HEAT[key]! : HEAT.slab!;
}

export const HEAT_BUCKETS = [0, 0.15, 0.3, 0.5, 1] as const;

/** Nearest bucket, so a handful of materials cover every mesh. */
export function heatBucket(heat: number): number {
  let best: number = HEAT_BUCKETS[0];
  for (const b of HEAT_BUCKETS) if (Math.abs(b - heat) < Math.abs(best - heat)) best = b;
  return best;
}
