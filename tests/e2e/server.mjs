// Web server for the end-to-end tests: serves the site like Netlify does, and runs the real account
// function (netlify/lib/comptes.mjs) against the local Firestore emulator.
import http from "node:http";
import { readFile } from "node:fs/promises";
import { join, extname, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { generateKeyPairSync } from "node:crypto";
import { handle } from "../../netlify/lib/comptes.mjs";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const PORT = Number(process.env.PORT || 5600);
// A throwaway signing key: the Auth emulator accepts custom tokens without checking who signed them.
const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const env = {
  FIREBASE_CLIENT_EMAIL: "tests@qui-de-nous-7244f.iam.gserviceaccount.com",
  FIREBASE_PRIVATE_KEY: privateKey.export({ type: "pkcs8", format: "pem" }),
  FIRESTORE_EMULATOR_HOST: process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8181",
  ADMIN_PSEUDO: "Boss"
};
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml" };

http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  if (url.pathname.startsWith("/api/compte/")) {
    const body = await new Promise(ok => { let d = ""; req.on("data", c => d += c); req.on("end", () => ok(d)); });
    const ip = req.headers["x-test-ip"] || req.socket.remoteAddress;
    const out = await handle(new Request("http://x" + req.url, { method: req.method, body: req.method === "POST" ? body : undefined }), { ip }, { env, fetch });
    res.writeHead(out.status, Object.fromEntries(out.headers)); res.end(await out.text()); return;
  }
  let p = normalize(decodeURIComponent(url.pathname)).replace(/^[\\/]+/, "");
  if (p === "" || p.endsWith(sep) || p.endsWith("/")) p += "index.html";
  const file = join(ROOT, p);
  if (!file.startsWith(ROOT) || p.startsWith("inkwell") || p.startsWith("tests")) { res.writeHead(404); res.end(); return; }
  try {
    const data = await readFile(file);
    res.writeHead(200, { "content-type": TYPES[extname(p)] || "application/octet-stream", "cache-control": "no-store" });
    res.end(data);
  } catch {
    // like Netlify: /quidenous → /quidenous/
    try { await readFile(join(file, "index.html")); res.writeHead(301, { location: url.pathname + "/" + url.search }); res.end(); }
    catch { res.writeHead(404); res.end("not found"); }
  }
}).listen(PORT, "127.0.0.1", () => console.log("test site on http://127.0.0.1:" + PORT));
