import { useEffect, useRef, useState } from "react";
import { MapFile } from "@war-room/content";
import type { FloorId } from "@war-room/content";
import { MAPS, mapNameFromSearch } from "./maps";
import { FLOOR_KEYS, allFloorsVisible } from "./greybox/plan";
import type { FloorVisibility } from "./greybox/plan";
import { createViewer } from "./viewer";
import type { Viewer } from "./viewer";

const mapName = mapNameFromSearch(window.location.search);
const map = MapFile.parse(MAPS[mapName].json);

const FLOOR_LABELS: Record<FloorId, string> = {
  grounds: "Grounds",
  ground: "Ground floor",
  upper: "Upper floor",
  roof: "Roof",
  lower: "Basement",
  shore: "Shore",
  hill: "Hill",
};

/** [key, floor] pairs in key order, from the same table the keyboard handler uses. */
const FLOOR_BUTTONS = Object.entries(FLOOR_KEYS) as [string, FloorId][];

declare global {
  interface Window {
    /** Dev-only handle for debugging and screenshots. */
    __warRoom?: Viewer;
  }
}

export function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const [floors, setFloors] = useState<FloorVisibility>(allFloorsVisible);
  const [fps, setFps] = useState(0);
  const [tick, setTick] = useState(0);
  const [backend, setBackend] = useState("starting");
  const [error, setError] = useState("");

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let disposed = false;
    let created: Viewer | null = null;
    createViewer(canvas, map, { onFloors: setFloors, onFps: setFps, onTick: setTick, onError: setError })
      .then((viewer) => {
        if (disposed) return viewer.dispose();
        created = viewer;
        viewerRef.current = viewer;
        setBackend(viewer.backend);
        if (import.meta.env.DEV) window.__warRoom = viewer;
      })
      .catch((e: unknown) => setError(String(e)));
    return () => {
      disposed = true;
      created?.dispose();
      viewerRef.current = null;
      delete window.__warRoom;
    };
  }, []);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <canvas ref={canvasRef} style={{ width: "100%", height: "100%", display: "block", outline: "none" }} />
      <div style={panel}>
        <div style={{ fontWeight: 700, letterSpacing: 1 }}>{mapName === "charon" ? "CHARON" : mapName.toUpperCase()} · greybox</div>
        <div style={{ opacity: 0.7, marginBottom: 8 }}>
          {map.id} v{map.version} · {backend} · {Math.round(fps)} fps · tick {tick}
        </div>
        {error && <div style={{ color: "#ff8080", marginBottom: 6 }}>{error}</div>}
        {FLOOR_BUTTONS.map(([key, floor]) => (
          <button
            key={floor}
            type="button"
            onClick={() => viewerRef.current?.toggleFloor(floor)}
            style={{ ...button, opacity: floors[floor] ? 1 : 0.4 }}
            title={`Toggle ${FLOOR_LABELS[floor]} (key ${key})`}
          >
            <kbd style={kbd}>{key}</kbd> {FLOOR_LABELS[floor]}
          </button>
        ))}
        <div style={{ opacity: 0.55, marginTop: 8, fontSize: 11, lineHeight: 1.4 }}>
          Drag: orbit · Right-drag / Ctrl-drag: pan · Wheel: zoom · L: room labels · Click: move operator
        </div>
      </div>
    </div>
  );
}

const panel: React.CSSProperties = {
  position: "absolute",
  top: 12,
  left: 12,
  padding: 12,
  borderRadius: 8,
  background: "rgba(10, 14, 20, 0.82)",
  color: "#d7e0ea",
  font: "13px/1.3 system-ui, sans-serif",
  userSelect: "none",
  minWidth: 190,
};

const button: React.CSSProperties = {
  display: "block",
  width: "100%",
  textAlign: "left",
  margin: "3px 0",
  padding: "5px 8px",
  borderRadius: 5,
  border: "1px solid #2a3644",
  background: "#16202c",
  color: "inherit",
  font: "inherit",
  cursor: "pointer",
};

const kbd: React.CSSProperties = {
  display: "inline-block",
  minWidth: 16,
  textAlign: "center",
  marginRight: 6,
  padding: "0 4px",
  borderRadius: 3,
  background: "#2a3644",
  fontSize: 11,
};
