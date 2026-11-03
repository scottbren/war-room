import { commandsSystem } from "./systems/commands";
import type { System } from "./systems/context";
import { movementSystem } from "./systems/movement";
import { smartHomeSystem } from "./systems/smart-home";

// Stubs for later tasks; they keep their slot in the order now.
const aiSystem: System = () => {};
const perceptionSystem: System = () => {};
const combatSystem: System = () => {};
const moraleSystem: System = () => {};
const objectivesSystem: System = () => {};
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
  moraleSystem,
  objectivesSystem,
  emitSystem,
];
