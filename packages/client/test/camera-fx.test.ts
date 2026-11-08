import { describe, expect, it } from "vitest";
import { cameraLabel, cameraMarkerColor, camerasSignature, cameraStatus } from "../src/cameraFx";

const cam = (id: string, live: boolean, sees: string[] = []) => ({ id, floor: "ground" as const, x: 1, y: 2, live, sees });

describe("camera feed helpers", () => {
  it("name a camera from its device id", () => {
    expect(cameraLabel("m.smart.camera.hall")).toBe("HALL");
    expect(cameraLabel("m.smart.camera.gate.north")).toBe("GATE NORTH");
    expect(cameraLabel("odd")).toBe("ODD");
  });

  it("say dark, clear, or what is in view", () => {
    expect(cameraStatus({ live: false, sees: [] })).toBe("DARK");
    expect(cameraStatus({ live: true, sees: [] })).toBe("LIVE · clear");
    expect(cameraStatus({ live: true, sees: ["def.vet.1", "fam.son"] })).toBe("LIVE · def.vet.1, fam.son");
  });

  it("colour the marker by state: three different colours", () => {
    const dark = cameraMarkerColor({ live: false, sees: [] });
    const clear = cameraMarkerColor({ live: true, sees: [] });
    const busy = cameraMarkerColor({ live: true, sees: ["x"] });
    expect(new Set([dark, clear, busy].map((c) => c.join(","))).size).toBe(3);
  });

  it("change the signature only when the feed list shows something different", () => {
    const a = [cam("c1", true), cam("c2", false)];
    expect(camerasSignature(a)).toBe(camerasSignature([cam("c1", true), cam("c2", false)]));
    expect(camerasSignature(a)).not.toBe(camerasSignature([cam("c1", true, ["def.a"]), cam("c2", false)]));
    expect(camerasSignature(a)).not.toBe(camerasSignature([cam("c1", false), cam("c2", false)]));
    expect(camerasSignature([])).toBe("");
  });
});
