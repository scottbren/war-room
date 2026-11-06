import { cameraSystem } from "./systems/cameras";
import { combatSystem } from "./systems/combat";
import { commandsSystem } from "./systems/commands";
import type { System } from "./systems/context";
import { mindSystem } from "./systems/mind";
import { operatorSystem as aiSystem } from "./systems/operators";
import { movementSystem } from "./systems/movement";
import { perceptionSystem } from "./systems/perception";
import { smartHomeSystem } from "./systems/smart-home";

// Stubs for later tasks; they keep their slot in the order now.
const moraleSystem: System = () => {};
const objectivesSystem: System = () => {};
/**
 * Defenders react to everything sensed this tick, including the shots just fired in combat, so this runs after combat.
 * Their orders are carried out by movement on the next tick. Cameras report here too.
 */
const defenderMindsSystem: System = (world, ctx) => mindSystem(world, ctx, cameraSystem(world, ctx));
/** Events and the snapshot are collected by createSim after the pipeline runs. */
const emitSystem: System = () => {};

/** System order from the technical design. Do not reorder without updating the design doc. */
export const pipeline: readonly System[] = [
  commandsSystem,
  aiSystem,
  movementSystem,
  perceptionSystem,
  smartHomeSystem,
  combatSystem,
  defenderMindsSystem,
  moraleSystem,
  objectivesSystem,
  emitSystem,
];
