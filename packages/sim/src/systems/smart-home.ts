import type { AlertLevel } from "../types";
import { sortedDeviceIds, sortedShutterIds } from "../world";
import type { World } from "../world";
import type { System } from "./context";

/** True while at least one hub is on. */
export function hubOnline(world: World): boolean {
  return sortedDeviceIds(world).some((id) => world.devices[id]!.kind === "hub" && world.devices[id]!.state === "on");
}

/**
 * Runs each alert level's automation once, when the level is first reached (edge-triggered, so a
 * manual override afterwards is not undone). Needs a working hub: with none, the levels pass unanswered.
 * 1: floodlights on. 2: every shutter closes. 3: every working lock locks its door.
 */
export const smartHomeSystem: System = (world, ctx) => {
  if (world.alert <= world.alertApplied) {
    world.alertApplied = world.alert; // standing down re-arms the levels; nothing is undone
    return;
  }
  const online = hubOnline(world);
  for (let level = world.alertApplied + 1; level <= world.alert; level++) {
    if (!online) continue;
    if (level === 1) {
      for (const id of sortedDeviceIds(world)) {
        const d = world.devices[id]!;
        if (d.kind === "floodlight" && d.state === "off") {
          d.state = "on";
          ctx.emit({ type: "device", deviceId: id, state: "on" });
        }
      }
    } else if (level === 2) {
      for (const id of sortedShutterIds(world)) {
        if (world.shutters[id] === "open") {
          world.shutters[id] = "closed";
          ctx.emit({ type: "shutter", windowId: id, state: "closed" });
        }
      }
    } else {
      for (const id of sortedDeviceIds(world)) {
        const d = world.devices[id]!;
        if (d.kind === "lock" && d.state === "on" && d.door !== undefined && world.doors[d.door] !== "locked") {
          world.doors[d.door] = "locked";
          ctx.emit({ type: "door", doorId: d.door, state: "locked" });
        }
      }
    }
  }
  world.alertApplied = world.alert as AlertLevel;
};
