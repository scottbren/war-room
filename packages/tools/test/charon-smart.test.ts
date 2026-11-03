import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { MapFile } from "@war-room/content";
import { createSim } from "@war-room/sim";

const file = fileURLToPath(new URL("../../content/maps/charon.json", import.meta.url));
const map = MapFile.parse(JSON.parse(readFileSync(file, "utf8")));
const newSim = () => createSim({ seed: 1, map });

describe("charon smart home in the sim", () => {
  it("builds a device for every smart marker and a shutter for every shuttered window", () => {
    const { snapshot } = newSim().step();
    const smartMarkers = map.markers.filter((m) => m.tags.some((t) => t.startsWith("smart:")));
    expect(snapshot.devices).toHaveLength(smartMarkers.length);
    const shuttered = map.floors.flatMap((f) => f.windows).filter((w) => w.shutter);
    expect(snapshot.shutters).toHaveLength(shuttered.length);
    expect(snapshot.devices.filter((d) => d.kind === "hub")).toHaveLength(2);
    expect(snapshot.hubOnline).toBe(true);
  });

  it("alarm drops every shutter and lockdown locks the main, SOC and panic-room doors", () => {
    const sim = newSim();
    sim.enqueue({ kind: "setAlert", tick: 0, level: 3 });
    const { snapshot } = sim.step();
    expect(snapshot.shutters.every((s) => s.state === "closed")).toBe(true);
    for (const id of ["d.g.main", "d.g.soc-bath", "d.g.panic-core"]) expect(snapshot.doors.find((d) => d.id === id)!.state, id).toBe("locked");
    expect(snapshot.devices.filter((d) => d.kind === "floodlight").every((d) => d.state === "on")).toBe(true);
  });

  it("taking out the SOC hub alone does not blind the house, but taking out both does", () => {
    const sim = newSim();
    const primary = map.markers.find((m) => m.tags.includes("hub:primary"))!.id;
    const backup = map.markers.find((m) => m.tags.includes("hub:backup"))!.id;
    sim.enqueue({ kind: "setDevice", tick: 0, deviceId: primary, state: "off" });
    expect(sim.step().snapshot.hubOnline).toBe(true);
    sim.enqueue({ kind: "setDevice", tick: 1, deviceId: backup, state: "off" });
    sim.enqueue({ kind: "setAlert", tick: 1, level: 3 });
    const { snapshot } = sim.step();
    expect(snapshot.hubOnline).toBe(false);
    expect(snapshot.shutters.every((s) => s.state === "open")).toBe(true);
  });
});
