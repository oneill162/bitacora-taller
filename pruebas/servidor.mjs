// Sirve docs/ como lo haría GitHub Pages, y las páginas de prueba desde aquí.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";

const DOCS = join(import.meta.dirname, "..", "docs");
const AQUI = import.meta.dirname;
const TIPOS = { ".html":"text/html", ".js":"text/javascript", ".mjs":"text/javascript",
                ".css":"text/css", ".json":"application/json", ".png":"image/png" };

createServer(async (req, res) => {
  let ruta = req.url.split("?")[0];
  if(ruta === "/") ruta = "/index.html";
  const base = ruta.startsWith("/prueba") ? AQUI : DOCS;
  try{
    const cuerpo = await readFile(join(base, ruta));
    res.writeHead(200, { "Content-Type": TIPOS[extname(ruta)] || "application/octet-stream",
                         "Service-Worker-Allowed": "/" });
    res.end(cuerpo);
  } catch(_){ res.writeHead(404); res.end("no está"); }
}).listen(8731, "127.0.0.1", () => console.log("servidor en 8731"));
