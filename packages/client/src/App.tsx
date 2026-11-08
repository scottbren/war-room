import { useEffect, useRef, useState } from "react";
import { MapFile } from "@war-room/content";
import type { FloorId } from "@war-room/content";
import { MAPS, mapNameFromSearch } from "./maps";
import { FLOOR_KEYS, allFloorsVisible } from "./greybox/plan";
import type { FloorVisibility } from "./greybox/plan";
import { createViewer } from "./viewer";
import type { Viewer } from "./viewer";
import { cameraLabel, cameraStatus } from "./cameraFx";
import type { KnownCamera } from "@war-room/sim";
import { ADVISORS, MAX_PLAYER_TEXT, advisor } from "@war-room/agents";
import type { AdvisorId, Message } from "@war-room/agents";

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
  const [tapped, setTapped] = useState(false);
  const [cameras, setCameras] = useState<KnownCamera[]>([]);
  const [messages, setMessages] = useState<readonly Message[]>([]);
  const [to, setTo] = useState<AdvisorId>("hale");
  const [draft, setDraft] = useState("");
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [messages]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let disposed = false;
    let created: Viewer | null = null;
    createViewer(canvas, map, { onFloors: setFloors, onFps: setFps, onTick: setTick, onError: setError, onCameras: setCameras, onMessages: setMessages })
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
          Drag: orbit · Right-drag / Ctrl-drag: pan · Wheel: zoom · L: room labels · T: truth view (debug) · Click: move operator
        </div>
      </div>
        <div style={cctvPanel} data-testid="cctv">
          <div style={{ fontWeight: 700, letterSpacing: 1, marginBottom: 4 }}>CCTV</div>
          {!tapped ? (
            <button
              type="button"
              style={button}
              title="Hack into the estate's camera network"
              onClick={() => {
                viewerRef.current?.tapCameras();
                setTapped(true);
              }}
            >
              Tap camera network
            </button>
          ) : (
            cameras.map((cam) => (
              <div key={cam.id} style={{ fontSize: 12, margin: "2px 0", color: cam.live ? (cam.sees.length > 0 ? "#ffc23a" : "#5fe08a") : "#7a8594" }}>
                <b>{cameraLabel(cam.id)}</b> {cameraStatus(cam)}
              </div>
            ))
          )}
        </div>
      <form
        style={advisorPanel}
        data-testid="advisors"
        onSubmit={(e) => {
          e.preventDefault();
          if (draft.trim() === "") return;
          viewerRef.current?.askAdvisor(to, draft);
          setDraft("");
        }}
      >
        <div style={{ fontWeight: 700, letterSpacing: 1 }}>ADVISORS</div>
        <div style={{ opacity: 0.6, fontSize: 11, marginBottom: 6 }}>offline: canned replies, no LLM attached yet</div>
        <div ref={logRef} style={{ maxHeight: 200, overflowY: "auto", marginBottom: 6 }}>
          {messages.length === 0 && <div style={{ opacity: 0.5, fontSize: 12 }}>Advisors speak up as the operators see and hear things. Or ask one below.</div>}
          {messages.map((m) => (
            <div key={m.id} style={{ fontSize: 12, margin: "3px 0", opacity: m.kind === "ack" ? 0.6 : 1, fontStyle: m.kind === "ack" ? "italic" : "normal", color: m.from === "president" ? "#9ec5ff" : "inherit" }}>
              <b>{m.from === "president" ? "You" : advisor(m.from).name}</b> {m.text}
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          <select value={to} onChange={(e) => setTo(e.target.value as AdvisorId)} style={field} aria-label="Ask which advisor">
            {ADVISORS.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          <input value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={MAX_PLAYER_TEXT} placeholder="Ask…" style={{ ...field, flex: 1, minWidth: 0 }} aria-label="Your question" />
          <button type="submit" style={{ ...button, width: "auto", margin: 0 }}>
            Send
          </button>
        </div>
      </form>
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

const cctvPanel: React.CSSProperties = {
  ...panel,
  left: undefined,
  right: 12,
  maxHeight: "calc(100vh - 400px)",
  overflowY: "auto",
  maxWidth: 300,
  wordBreak: "break-word",
};

const advisorPanel: React.CSSProperties = {
  ...panel,
  top: undefined,
  left: undefined,
  bottom: 12,
  right: 12,
  width: 340,
};

const field: React.CSSProperties = {
  padding: "4px 6px",
  borderRadius: 5,
  border: "1px solid #2a3644",
  background: "#0d141c",
  color: "inherit",
  font: "inherit",
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
