const out = document.getElementById("out")!;
const worker = new Worker(new URL("./navWorker.ts", import.meta.url), { type: "module" });
worker.onmessage = (e: MessageEvent) => {
  (window as unknown as { __navResult: unknown }).__navResult = e.data;
  out.textContent = JSON.stringify(e.data, null, 2);
};
worker.onerror = (e) => {
  (window as unknown as { __navResult: unknown }).__navResult = { ok: false, error: e.message };
  out.textContent = `worker error: ${e.message}`;
};
worker.postMessage("run");
