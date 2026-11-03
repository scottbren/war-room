/**
 * Canonical serialization and hashing of simulation state.
 *
 * Canonical form: JSON-like text, object keys sorted, undefined properties
 * skipped, numbers quantized to 1/1000 (integers untouched). The hash is
 * 32-bit FNV-1a over the UTF-8 bytes, as 8 lowercase hex digits.
 */

function canonicalNumber(n: number): string {
  if (!Number.isFinite(n)) throw new Error(`canonicalize: non-finite number ${n}`);
  if (Number.isInteger(n)) return String(n + 0); // + 0 turns -0 into 0
  return String(Math.round(n * 1000) / 1000 + 0);
}

export function canonicalize(value: unknown): string {
  if (value === null) return "null";
  switch (typeof value) {
    case "number":
      return canonicalNumber(value);
    case "string":
      return JSON.stringify(value);
    case "boolean":
      return value ? "true" : "false";
    case "object": {
      if (Array.isArray(value)) {
        // Array.from visits sparse holes as undefined, so they serialize as null.
        return `[${Array.from(value as unknown[], (v) => (v === undefined ? "null" : canonicalize(v))).join(",")}]`;
      }
      const proto: unknown = Object.getPrototypeOf(value);
      if (proto !== Object.prototype && proto !== null) {
        // Map, Set, Date, class instances... would silently collapse to {}.
        throw new Error("canonicalize: only plain objects and arrays are allowed in state");
      }
      const obj = value as Record<string, unknown>;
      const parts: string[] = [];
      for (const key of Object.keys(obj).sort()) {
        const v = obj[key];
        if (v === undefined) continue;
        parts.push(`${JSON.stringify(key)}:${canonicalize(v)}`);
      }
      return `{${parts.join(",")}}`;
    }
    default:
      throw new Error(`canonicalize: unsupported type ${typeof value}`);
  }
}

/** 32-bit FNV-1a of a string's UTF-8 bytes, as 8 hex digits. */
export function fnv1a32(text: string): string {
  let h = 0x811c9dc5;
  for (const byte of new TextEncoder().encode(text)) {
    h = Math.imul(h ^ byte, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/** Hash any plain-data value independent of key insertion order. */
export function hashState(value: unknown): string {
  return fnv1a32(canonicalize(value));
}
