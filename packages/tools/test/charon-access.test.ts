import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { MapFile } from "@war-room/content";
import type { Room } from "@war-room/content";

const file = fileURLToPath(new URL("../../content/maps/charon.json", import.meta.url));
const map = MapFile.parse(JSON.parse(readFileSync(file, "utf8")));
const withTag = (tag: string) => map.markers.filter((m) => m.tags.includes(tag));
const tagValue = (m: { tags: string[] }, prefix: string) => m.tags.find((t) => t.startsWith(prefix + ":"))?.slice(prefix.length + 1);
const roomOf = (m: { floor: string; at?: { x: number; y: number } }): Room | undefined =>
  map.floors.find((f) => f.id === m.floor)?.rooms.find((r) => r.id && m.at && m.at.x >= r.rect.min.x && m.at.x <= r.rect.max.x && m.at.y >= r.rect.min.y && m.at.y <= r.rect.max.y);
const readers = () => map.markers.filter((m) => tagValue(m, "auth") !== undefined);
const readersFor = (doorId: string) => readers().filter((m) => tagValue(m, "door") === doorId);

describe("charon access control: readers on doors", () => {
  it("has plenty of readers, each naming a real door on its own floor and standing beside it", () => {
    expect(readers().length).toBeGreaterThanOrEqual(18);
    for (const r of readers()) {
      const door = map.floors.find((f) => f.id === r.floor)?.doors.find((d) => d.id === tagValue(r, "door"));
      expect(door, r.id).toBeDefined();
      expect(Math.hypot(door!.at.x - r.at!.x, door!.at.y - r.at!.y), r.id).toBeLessThanOrEqual(4);
      expect(Number(tagValue(r, "level")), r.id).toBeGreaterThanOrEqual(1);
    }
  });

  it("uses all five methods: keypad, biometric, badge, key and dial", () => {
    const methods = new Set(readers().map((r) => tagValue(r, "auth")));
    expect([...methods].sort()).toEqual(["badge", "biometric", "dial", "key", "keypad"]);
  });

  it("puts the panic room behind biometric plus keypad, on the air-gapped panic circuit", () => {
    for (const door of ["d.g.panic-core", "d.u.safe-core"]) {
      const methods = readersFor(door).map((r) => tagValue(r, "auth")).sort();
      expect(methods, door).toEqual(["biometric", "keypad"]);
      for (const r of readersFor(door)) {
        expect(tagValue(r, "vlan"), r.id).toBe("panic");
        expect(tagValue(r, "circuit"), r.id).toBe("c.panic");
      }
    }
  });

  it("guards the vault with a mechanical dial that works with no power or network, plus a biometric reader", () => {
    const vault = readersFor("d.l.vault-corridor");
    const dial = vault.find((r) => tagValue(r, "auth") === "dial")!;
    expect(dial).toBeDefined();
    expect(tagValue(dial, "vlan")).toBeUndefined();
    expect(tagValue(dial, "circuit")).toBeUndefined();
    expect(vault.some((r) => tagValue(r, "auth") === "biometric")).toBe(true);
  });

  it("makes every networked reader sit on a circuit, and keys and dials need neither", () => {
    for (const r of readers()) {
      const mechanical = ["dial", "key"].includes(tagValue(r, "auth")!);
      expect(tagValue(r, "vlan") === undefined, r.id).toBe(mechanical);
      expect(tagValue(r, "circuit") === undefined, r.id).toBe(mechanical);
    }
  });

  it("covers the front door, the gate, the SOC, the study, the armory and the plant room", () => {
    for (const door of ["d.g.main", "d.gate", "d.g.soc-bath", "d.g.soc-service", "d.g.drawing-study", "d.l.armory-corridor", "d.r.b-plant"]) {
      expect(readersFor(door).length, door).toBeGreaterThanOrEqual(1);
    }
  });
});

describe("charon other security fixtures", () => {
  it("has alarm panels at the gate lodge, the SOC and the foyer, and silent panic buttons", () => {
    const rooms = withTag("sec:alarm-panel").map((m) => roomOf(m)?.id);
    expect(rooms).toEqual(expect.arrayContaining(["grounds.gate-lodge", "g.soc", "g.foyer"]));
    expect(withTag("sec:panic-button").length).toBeGreaterThanOrEqual(4);
  });

  it("has a metal detector in the foyer, a key cabinet and monitors in the guard room and the SOC", () => {
    expect(withTag("sec:metal-detector").map((m) => roomOf(m)?.id)).toEqual(["g.foyer"]);
    expect(withTag("sec:key-cabinet").map((m) => roomOf(m)?.id)).toEqual(["g.security"]);
    expect(withTag("sec:monitor").map((m) => roomOf(m)?.id).sort()).toEqual(["g.security", "g.soc"]);
  });

  it("protects the vault with a laser grid and fire suppression that seals it", () => {
    expect(withTag("sec:laser-grid").map((m) => roomOf(m)?.id)).toEqual(["l.vault"]);
    expect(withTag("sec:suppression").map((m) => roomOf(m)?.id)).toEqual(["l.vault"]);
  });

  it("has seismic ground sensors along the fence and a gate barrier controller in the lodge", () => {
    expect(withTag("sec:ground-sensor").length).toBeGreaterThanOrEqual(6);
    expect(withTag("sec:barrier-control").map((m) => roomOf(m)?.id)).toEqual(["grounds.gate-lodge"]);
  });

  it("puts physical safes in the study and the office, and an armory rack in the armory", () => {
    expect(withTag("sec:safe").map((m) => roomOf(m)?.id).sort()).toEqual(["g.study", "u.office"]);
    expect(withTag("sec:armory-rack").map((m) => roomOf(m)?.id)).toEqual(["l.armory"]);
  });

  it("puts every networked security fixture on a circuit", () => {
    for (const m of map.markers.filter((x) => x.tags.some((t) => t.startsWith("sec:")))) {
      if (m.tags.includes("sec:ground-sensor")) continue;
      expect(tagValue(m, "circuit") !== undefined || m.tags.includes("sec:safe") || m.tags.includes("sec:armory-rack") || m.tags.includes("sec:key-cabinet"), m.id).toBe(true);
    }
  });
});
