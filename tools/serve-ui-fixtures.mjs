import { createServer } from "node:http";
import { readFile, realpath } from "node:fs/promises";
import path from "node:path";
const root = path.resolve(import.meta.dirname, "..");
const realRoot = await realpath(root);
const port = Number(process.env.PORT ?? 39717);
const types = { ".html": "text/html", ".mjs": "text/javascript", ".json": "application/json", ".css": "text/css", ".svg": "image/svg+xml" };
createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    const target = pathname === "/" ? "/tests/fixtures/browser.html" : pathname;
    const file = path.resolve(root, `.${target}`);
    const relative = "/" + path.relative(root, file).split(path.sep).join("/");
    const allowed = /^\/(scripts|data|lang|assets)\//.test(relative) || relative === "/module.css" || relative === "/tests/fixtures/browser.html";
    if (!allowed || !file.startsWith(root + path.sep) || request.method !== "GET") {
      response.writeHead(404); response.end(); return;
    }
    const canonical = await realpath(file);
    if (!canonical.startsWith(realRoot + path.sep)) {
      response.writeHead(404); response.end(); return;
    }
    const content = await readFile(canonical);
    response.writeHead(200, { "Content-Type": (types[path.extname(file)] ?? "application/octet-stream") + "; charset=utf-8", "Cache-Control": "no-store" });
    response.end(content);
  } catch {
    response.writeHead(404); response.end();
  }
}).listen(port, "127.0.0.1", () => console.log(`UI fixture server listening on 127.0.0.1:${port}`));
