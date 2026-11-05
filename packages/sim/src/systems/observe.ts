import type { Side } from "@war-room/content";

/** Who can notice whom. Operators watch everyone who is not theirs; defenders watch operators. */
export function canObserve(observer: Side, target: Side): boolean {
  if (observer === "operator") return target !== "operator";
  if (observer === "defender") return target === "operator";
  return false;
}
