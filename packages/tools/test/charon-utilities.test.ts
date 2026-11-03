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
  map.floors.find((f) => f.id === m.floor)?.rooms.find((r) => m.at && m.at.x >= r.rect.min.x && m.at.x <= r.rect.max.x && m.at.y >= r.rect.min.y && m.at.y <= r.rect.max.y);

describe("charon power: sources, panels and circuits", () => {
  it("has the mains intake, a transformer, two generators, a fuel tank and batteries", () => {
    expect(withTag("power:mains")).toHaveLength(1);
    expect(withTag("power:transformer")).toHaveLength(1);
    expect(withTag("power:generator")).toHaveLength(2);
    expect(withTag("power:fuel")).toHaveLength(1);
    expect(withTag("power:battery").length).toBeGreaterThanOrEqual(2);
    expect(roomOf(withTag("power:transformer")[0]!)?.id).toBe("grounds.power-house");
    expect(withTag("power:generator").map((m) => roomOf(m)?.id).sort()).toEqual(["g.service", "l.mech"]);
  });

  it("has one breaker panel per circuit, and the panic panel is inside the panic room", () => {
    const panels = withTag("util:panel");
    const circuits = panels.map((p) => tagValue(p, "feeds")!).sort();
    expect(circuits).toEqual(["c.gate", "c.house.a", "c.house.b", "c.house.c", "c.panic", "c.perimeter", "c.roof", "c.soc"]);
    expect(roomOf(panels.find((p) => tagValue(p, "feeds") === "c.panic")!)?.id).toBe("g.panic");
    expect(roomOf(panels.find((p) => tagValue(p, "feeds") === "c.soc")!)?.id).toBe("g.soc");
    expect(roomOf(panels.find((p) => tagValue(p, "feeds") === "c.roof")!)?.id).toBe("r.plant-house");
  });

  it("puts every smart device on a circuit and a network segment (vlan)", () => {
    const devices = map.markers.filter((m) => m.tags.some((t) => t.startsWith("smart:")));
    expect(devices.length).toBeGreaterThanOrEqual(30);
    for (const d of devices) {
      expect(tagValue(d, "circuit"), d.id).toBeDefined();
      expect(tagValue(d, "vlan"), d.id).toBeDefined();
    }
  });

  it("keeps the panic-room door lock on the panic circuit and an air-gapped segment", () => {
    const lock = map.markers.find((m) => m.id === "m.smart.lock.panic")!;
    expect(tagValue(lock, "circuit")).toBe("c.panic");
    expect(tagValue(lock, "vlan")).toBe("panic");
  });

  it("puts the two hubs on different circuits", () => {
    const hubs = withTag("smart:hub").map((m) => tagValue(m, "circuit"));
    expect(new Set(hubs).size).toBe(2);
  });
});

describe("charon comms", () => {
  it("has a landline junction at the gate, a satellite dish and modem on the roof, a radio base in the SOC and a cell tower off site", () => {
    expect(roomOf(withTag("comms:landline")[0]!)?.id).toBe("grounds.gate-lodge");
    expect(withTag("comms:sat")[0]!.floor).toBe("roof");
    expect(roomOf(withTag("comms:radio-base")[0]!)?.id).toBe("g.soc");
    expect(withTag("comms:cell")).toHaveLength(1);
    expect(withTag("comms:sat-phone").some((m) => roomOf(m)?.id === "g.panic")).toBe(true);
    expect(withTag("comms:siren").length).toBeGreaterThanOrEqual(2);
  });
});

describe("charon intel", () => {
  const items = () => withTag("intel:item");

  it("has the principal's drives, the vault archive, the SOC records and more, all inside rooms", () => {
    expect(items().length).toBeGreaterThanOrEqual(8);
    for (const m of items()) {
      expect(roomOf(m), m.id).toBeDefined();
      expect(tagValue(m, "type"), m.id).toMatch(/^(digital|paper|physical)$/);
      expect(Number(tagValue(m, "value")), m.id).toBeGreaterThan(0);
    }
    const ids = items().map((m) => tagValue(m, "id"));
    for (const id of ["study-drive", "office-safe", "vault-archive", "soc-records", "panic-drive", "master-devices", "guard-roster", "armory-manifest", "yacht-charts"]) {
      expect(ids, id).toContain(id);
    }
  });

  it("ranks the vault archive and the panic-room drive among the most valuable, and marks wipeable ones", () => {
    const value = (id: string) => Number(tagValue(items().find((m) => tagValue(m, "id") === id)!, "value"));
    expect(value("vault-archive")).toBeGreaterThanOrEqual(value("guard-roster"));
    expect(value("panic-drive")).toBeGreaterThanOrEqual(value("armory-manifest"));
    expect(items().some((m) => m.tags.includes("wipe:yes"))).toBe(true);
  });
});

describe("charon network (cyber attack surface, game design only)", () => {
  it("has a router and recorder in the SOC, a satellite modem, wifi points, a gate keypad and no wifi in the panic room", () => {
    expect(roomOf(withTag("net:router")[0]!)?.id).toBe("g.soc");
    expect(roomOf(withTag("net:dvr")[0]!)?.id).toBe("g.soc");
    expect(withTag("net:sat-modem")[0]!.floor).toBe("roof");
    expect(withTag("net:wifi").length).toBeGreaterThanOrEqual(4);
    expect(withTag("net:keypad").length).toBeGreaterThanOrEqual(1);
    for (const ap of withTag("net:wifi")) expect(roomOf(ap)?.id, ap.id).not.toBe("g.panic");
  });

  it("separates the guest, house, security and panic segments, with a guest wifi as the soft way in", () => {
    const vlans = new Set(map.markers.map((m) => tagValue(m, "vlan")).filter(Boolean));
    expect([...vlans].sort()).toEqual(["guest", "house", "panic", "security"]);
    expect(withTag("vlan:guest").some((m) => m.tags.includes("net:wifi"))).toBe(true);
  });

  it("tells the attacker how each entry point is reached (physical, wifi or remote)", () => {
    const entries = withTag("net:entry");
    expect(entries.length).toBeGreaterThanOrEqual(4);
    const access = new Set(entries.map((m) => tagValue(m, "access")));
    expect([...access].sort()).toEqual(["physical", "remote", "wifi"]);
  });
});
