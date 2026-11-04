/** Debug page for T12: runs the recorded replay in a worker and prints the per-tick hash list (also on window.__replayHashes). */
const out = document.getElementById("out") as HTMLPreElement;
const worker = new Worker(new URL("./replayWorker.ts", import.meta.url), { type: "module" });
worker.onmessage = (event: MessageEvent<{ ok: boolean; error?: string; inWorker?: boolean; hashes?: string[] }>) => {
  const data = event.data;
  if (!data.ok) {
    out.textContent = `ERROR: ${data.error}`;
    (window as unknown as { __replayError: string }).__replayError = data.error ?? "unknown";
    return;
  }
  (window as unknown as { __replayHashes: string[] }).__replayHashes = data.hashes ?? [];
  out.textContent = `ticks: ${data.hashes?.length}\ninWorker: ${data.inWorker}\nfinal: ${data.hashes?.at(-1)}\n${JSON.stringify(data.hashes)}`;
};
worker.onerror = (e) => {
  out.textContent = `ERROR: ${e.message}`;
  (window as unknown as { __replayError: string }).__replayError = e.message;
};
worker.postMessage("go");
