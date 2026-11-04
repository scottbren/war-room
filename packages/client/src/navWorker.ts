import { MapFile } from "@war-room/content";
import { createNav } from "@war-room/sim";
import mapJson from "../../content/maps/charon.json";
import navmeshUrl from "../../content/generated/charon.navmesh.bin?url";
import { runNavQueries } from "./navQueries";

/** Debug worker for T8: proves recast initialises and answers path queries inside a Web Worker. */
self.onmessage = async () => {
  try {
    const map = MapFile.parse(mapJson);
    const data = new Uint8Array(await (await fetch(navmeshUrl)).arrayBuffer());
    const nav = await createNav({ data, map });
    self.postMessage({ ok: true, inWorker: typeof document === "undefined", results: runNavQueries(nav, map) });
  } catch (e) {
    self.postMessage({ ok: false, error: String(e) });
  }
};
