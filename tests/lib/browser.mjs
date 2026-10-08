// Pengendali Chrome headless lewat Chrome DevTools Protocol (tanpa library tambahan).
// Lokasi Chrome bisa diatur dengan variabel CHROME_PATH.
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const CANDIDATES = [
  process.env.CHROME_PATH,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
];
export const chromePath = () => CANDIDATES.find((p) => p && fs.existsSync(p));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let nextPort = 9500;

export async function launch({ extraArgs = [] } = {}) {
  const exe = chromePath();
  if (!exe) throw new Error("Chrome tidak ditemukan. Atur CHROME_PATH ke lokasi Chrome/Chromium.");
  const port = nextPort++;
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "mampat-test-"));
  const chrome = spawn(exe, ["--headless=new", "--remote-debugging-port=" + port, "--user-data-dir=" + profile,
    "--no-first-run", "--no-default-browser-check", "--hide-scrollbars", "--no-sandbox", ...extraArgs, "about:blank"], { stdio: "ignore" });
  const kill = () => { try { chrome.kill("SIGKILL"); } catch {} };
  process.on("exit", kill); // pastikan Chrome ikut mati kalau uji berhenti di tengah jalan
  let tabs = null;
  for (let i = 0; i < 100 && !tabs; i++) { try { tabs = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); } catch { await sleep(150); } }
  if (!tabs) throw new Error("Chrome tidak merespons");
  const ws = new WebSocket(tabs.find((t) => t.type === "page").webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let id = 0;
  const pending = new Map(), logs = [];
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pending.has(d.id)) { const p = pending.get(d.id); pending.delete(d.id); d.error ? p.reject(new Error(d.error.message)) : p.resolve(d.result); }
    if (d.method === "Runtime.exceptionThrown") logs.push("exception: " + (d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text));
    if (d.method === "Runtime.consoleAPICalled" && d.params.type === "error") logs.push("console.error: " + d.params.args.map((a) => a.value ?? a.description).join(" "));
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => { const i = ++id; pending.set(i, { resolve, reject }); ws.send(JSON.stringify({ id: i, method, params })); });
  await send("Runtime.enable"); await send("Page.enable"); await send("Network.enable");

  const page = {
    logs, send, sleep,
    async goto(url) { logs.length = 0; await send("Page.navigate", { url }); await page.waitFor("document.readyState === 'complete' && !!window.Mampat"); },
    async eval(expr) {
      const r = await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
      return r.result.value;
    },
    async waitFor(expr, ms = 60000) {
      const end = Date.now() + ms;
      while (Date.now() < end) { try { if (await page.eval(expr)) return; } catch {} await sleep(150); }
      throw new Error("Waktu habis menunggu: " + expr);
    },
    async viewport(width, height = 900, mobile = false) { await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile }); },
    async setFiles(selector, files) {
      const r = await send("Runtime.evaluate", { expression: `document.querySelector(${JSON.stringify(selector)})` });
      await send("DOM.setFileInputFiles", { objectId: r.result.objectId, files });
    },
    // tangkap file yang "diunduh" (blob dari tombol Simpan) dan kembalikan isinya ke Node
    async captureDownload(buttonSelector) {
      const b64 = await page.eval(`new Promise((resolve) => {
        const orig = URL.createObjectURL;
        URL.createObjectURL = (blob) => { URL.createObjectURL = orig; blob.arrayBuffer().then((a) => { const u = new Uint8Array(a); let s = ""; for (let i = 0; i < u.length; i += 32768) s += String.fromCharCode.apply(null, u.subarray(i, i + 32768)); resolve(btoa(s)); }); return orig(blob); };
        document.querySelector(${JSON.stringify(buttonSelector)}).click();
      })`);
      return Buffer.from(b64, "base64");
    },
    async close() {
      const exited = new Promise((r) => chrome.once("exit", r));
      try { await send("Browser.close"); } catch {}
      await Promise.race([exited, sleep(5000)]); kill(); process.off("exit", kill);
      try { fs.rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); } catch {}
    },
  };
  return page;
}
