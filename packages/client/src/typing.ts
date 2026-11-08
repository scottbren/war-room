/** True when a key event came from a text field (the advisor chat), so the viewer's hotkeys must not fire. */
export function isTypingTarget(target: EventTarget | null): boolean {
  const tag = (target as { tagName?: unknown } | null)?.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}
