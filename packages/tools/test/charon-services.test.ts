import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { MapFile } from "@war-room/content";
import type { Room } from "@war-room/content";

const file = fileURLToPath(new URL("../../content/maps/charon.json", import.meta.url));
const map = MapFile.parse(JSON.parse(readFileSync(file, "utf8")));
const withTag = (tag: string) => map.markers.filter((m) => m.tags.includes(tag));
const tagValues = (m: { tags: string[] }, prefix: string) => m.tags.filter((t) => t.startsWith(prefix + ":")).map((t) => t.slice(prefix.length + 1));
const tagValue = (m: { tags: string[] }, prefix: string) => tagValues(m, prefix)[0];
const roomOf = (m: { floor: string; at?: { x: number; y: number } }): Room | undefined =>
  map.floors.find((f) => f.id === m.floor)?.rooms.find((r) => m.at && m.at.x >= r.rect.min.x && m.at.x <= r.rect.max.x && m.at.y >= r.rect.min.y && m.at.y <= r.rect.max.y);
const roomIds = new Set(map.floors.flatMap((f) => f.rooms.map((r) => r.id)));

describe("charon building services: water, gas and air", () => {
  it("has a water main and gas main outside, with shutoffs in the mechanical room and a gas range in the kitchen", () => {
    expect(withTag("svc:water-main")).toHaveLength(1);
    expect(withTag("svc:gas-main")).toHaveLength(1);
    expect(withTag("svc:water-shutoff").map((m) => roomOf(m)?.id)).toEqual(["l.mech"]);
    expect(withTag("svc:gas-shutoff").map((m) => roomOf(m)?.id)).toEqual(["l.mech"]);
    expect(withTag("svc:gas-appliance").map((m) => roomOf(m)?.id)).toContain("g.kitchen");
  });

  it("has an air handler per ventilation zone, roof intakes, and grates in the main rooms", () => {
    const zones = withTag("svc:ahu").map((m) => tagValue(m, "hvac")).sort();
    expect(zones).toEqual(["a", "b", "c"]);
    for (const m of withTag("svc:ahu")) expect(tagValue(m, "circuit"), m.id).toBeDefined();
    const intakes = withTag("svc:vent-intake");
    expect(intakes.length).toBeGreaterThanOrEqual(2);
    for (const m of intakes) expect(m.floor).toBe("roof");
    expect(withTag("svc:vent-grate").length).toBeGreaterThanOrEqual(8);
    for (const g of withTag("svc:vent-grate")) expect(["a", "b", "c"], g.id).toContain(tagValue(g, "hvac"));
  });

  it("keeps the panic room on its own filtered air, with no grate on the house system", () => {
    expect(withTag("svc:air-filter").map((m) => roomOf(m)?.id)).toEqual(["g.panic"]);
    for (const g of withTag("svc:vent-grate")) expect(roomOf(g)?.id, g.id).not.toBe("g.panic");
  });
});

describe("charon fire safety and lifts", () => {
  it("has a fire panel in the SOC, smoke detectors, and sprinklers in the kitchen, grand hall and cellar", () => {
    expect(withTag("svc:fire-panel").map((m) => roomOf(m)?.id)).toEqual(["g.soc"]);
    expect(withTag("svc:smoke-detector").length).toBeGreaterThanOrEqual(6);
    expect(withTag("svc:sprinkler").map((m) => roomOf(m)?.id).sort()).toEqual(["g.grand-hall", "g.kitchen", "l.cellar"]);
  });

  it("has a lift at each end of the core staircase, named by the link it duplicates", () => {
    const lifts = withTag("svc:elevator");
    expect(lifts.map((m) => m.floor).sort()).toEqual(["ground", "upper"]);
    for (const l of lifts) {
      const link = tagValue(l, "link");
      expect(map.verticalLinks.some((v) => v.id === link), l.id).toBe(true);
    }
  });
});

describe("charon camera coverage and blind spots", () => {
  const cams = () => withTag("smart:camera");

  it("lists the rooms each indoor camera sees, all real rooms", () => {
    for (const c of cams().filter((m) => ["ground", "upper", "lower", "roof"].includes(m.floor))) {
      const sees = tagValues(c, "sees");
      expect(sees.length, c.id).toBeGreaterThanOrEqual(1);
      for (const r of sees) expect(roomIds.has(r), `${c.id} sees ${r}`).toBe(true);
    }
  });

  it("watches the vault and the basement corridor, but deliberately not the panic room or the principal's study", () => {
    const seen = new Set(cams().flatMap((c) => tagValues(c, "sees")));
    for (const r of ["l.vault", "l.corridor.a", "g.foyer", "g.grand-hall", "u.gallery"]) expect(seen.has(r), r).toBe(true);
    for (const r of ["g.panic", "u.safe", "g.study", "g.master"]) expect(seen.has(r), r).toBe(false);
  });

  it("marks blind spots on the grounds and balcony, each with a reason", () => {
    const spots = withTag("sec:blind-spot");
    expect(spots.length).toBeGreaterThanOrEqual(5);
    for (const s of spots) expect(tagValue(s, "why"), s.id).toBeDefined();
  });
});

describe("charon phones", () => {
  it("has a switchboard in the guard room on a circuit, and phones with unique extensions", () => {
    const pbx = withTag("comms:pbx");
    expect(pbx.map((m) => roomOf(m)?.id)).toEqual(["g.security"]);
    expect(tagValue(pbx[0]!, "circuit")).toBeDefined();
    const phones = withTag("comms:phone");
    expect(phones.length).toBeGreaterThanOrEqual(8);
    const exts = phones.map((p) => tagValue(p, "ext"));
    expect(exts.every(Boolean)).toBe(true);
    expect(new Set(exts).size).toBe(exts.length);
    const rooms = phones.map((p) => roomOf(p)?.id);
    for (const r of ["grounds.gate-lodge", "g.soc", "g.security", "g.master", "g.study", "g.kitchen"]) expect(rooms, r).toContain(r);
  });
});
