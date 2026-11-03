import { DEFAULT_SPEED_CM_PER_TICK } from "../defaults";
import { toCm } from "../quantize";
import type { Command } from "../types";
import type { QueuedCommand, World } from "../world";
import type { Ctx, System } from "./context";

function reject(ctx: Ctx, command: Command, reason: string): void {
  ctx.emit({ type: "commandRejected", command: command.kind, reason });
}

function apply(world: World, ctx: Ctx, command: Command): void {
  switch (command.kind) {
    case "move": {
      const entity = world.entities[command.entity];
      if (!entity) return reject(ctx, command, `unknown entity: ${command.entity}`);
      if (command.to.floor !== entity.pos.floor) {
        return reject(ctx, command, "cross-floor moves need the navmesh (T8)");
      }
      entity.motion = {
        toXCm: toCm(command.to.x),
        toYCm: toCm(command.to.y),
        speedCmPerTick: DEFAULT_SPEED_CM_PER_TICK[entity.side],
      };
      return;
    }
    case "setDoor": {
      if (!Object.hasOwn(world.doors, command.doorId)) {
        return reject(ctx, command, `unknown door: ${command.doorId}`);
      }
      world.doors[command.doorId] = command.state;
      ctx.emit({ type: "door", doorId: command.doorId, state: command.state });
      return;
    }
    case "setDevice": {
      const device = world.devices[command.deviceId];
      if (!device) return reject(ctx, command, `unknown device: ${command.deviceId}`);
      if (command.state === "looped" && device.kind !== "camera") return reject(ctx, command, "only cameras can be looped");
      device.state = command.state;
      ctx.emit({ type: "device", deviceId: command.deviceId, state: command.state });
      return;
    }
    case "setShutter": {
      if (!Object.hasOwn(world.shutters, command.windowId)) {
        return reject(ctx, command, `no shutter on window: ${command.windowId}`);
      }
      world.shutters[command.windowId] = command.state;
      ctx.emit({ type: "shutter", windowId: command.windowId, state: command.state });
      return;
    }
    case "setAlert": {
      if (![0, 1, 2, 3].includes(command.level)) return reject(ctx, command, `invalid alert level: ${String(command.level)}`);
      world.alert = command.level;
      ctx.emit({ type: "alert", level: command.level });
      return;
    }
    case "issuePlan":
    case "decide":
    case "intervene":
      return reject(ctx, command, `${command.kind} is not implemented until week 2`);
  }
}

/**
 * Applies commands due this tick, in (tick, enqueue order). A command for a tick
 * that has already passed is rejected with an event; future commands stay queued.
 */
export const commandsSystem: System = (world, ctx) => {
  const byOrder = (a: QueuedCommand, b: QueuedCommand): number =>
    a.command.tick - b.command.tick || a.seq - b.seq;
  const due = world.queue.filter((q) => q.command.tick <= world.tick).sort(byOrder);
  world.queue = world.queue.filter((q) => q.command.tick > world.tick);

  for (const { command } of due) {
    if (command.tick < world.tick) reject(ctx, command, `tick ${command.tick} already passed`);
    else apply(world, ctx, command);
  }
};
