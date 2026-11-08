/**
 * Pure helpers for showing the security-camera feeds. They read only what the operators know (`Knowledge.cameras()`,
 * available once the network is tapped); nothing here decides anything about the raid.
 */
import type { KnownCamera } from "@war-room/sim";

/** A short readable name from a camera's device id ("m.smart.camera.hall" -> "HALL"). */
export function cameraLabel(id: string): string {
  return id.replace(/^m\.smart\.camera\./, "").replace(/^m\.smart\./, "").replace(/[._-]+/g, " ").trim().toUpperCase() || id.toUpperCase();
}

/** One line for the feed list: dark, live and empty, or live with what it shows. */
export function cameraStatus(cam: Pick<KnownCamera, "live" | "sees">): string {
  if (!cam.live) return "DARK";
  return cam.sees.length === 0 ? "LIVE · clear" : `LIVE · ${cam.sees.join(", ")}`;
}

/** Marker colour on the map: grey when dark, green when live and clear, amber when something is in view. */
export function cameraMarkerColor(cam: Pick<KnownCamera, "live" | "sees">): [number, number, number] {
  if (!cam.live) return [0.25, 0.25, 0.28];
  return cam.sees.length === 0 ? [0.2, 0.85, 0.4] : [1, 0.75, 0.15];
}

/** A string that changes only when the feed list shows something different, so the UI updates when it must and not every tick. */
export function camerasSignature(cams: readonly KnownCamera[]): string {
  return cams.map((c) => `${c.id}:${c.live ? 1 : 0}:${c.sees.join("+")}`).join("|");
}
