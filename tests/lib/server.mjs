// Server statis kecil untuk folder public/ (dipakai uji otomatis dan untuk mencoba situs di komputer).
// Jalankan langsung: node tests/lib/server.mjs  → http://127.0.0.1:8790
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const PUBLIC_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "public");
const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".png": "image/png", ".webmanifest": "application/manifest+json", ".json": "application/json",
};

export function startServer(port = 0) {
  const server = http.createServer((req, res) => {
    let file = path.join(PUBLIC_DIR, decodeURIComponent(new URL(req.url, "http://x").pathname));
    if (!file.startsWith(PUBLIC_DIR)) { res.writeHead(403).end(); return; }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, "index.html");
    if (!fs.existsSync(file)) { res.writeHead(404, { "content-type": "text/plain" }).end("404"); return; }
    res.writeHead(200, { "content-type": TYPES[path.extname(file)] || "application/octet-stream", "cache-control": "no-cache" });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve({ url: "http://127.0.0.1:" + server.address().port, close: () => server.close() })));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { url } = await startServer(Number(process.env.PORT) || 8790);
  console.log("Mampat berjalan di " + url + " (Ctrl+C untuk berhenti)");
}
