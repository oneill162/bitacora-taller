// Sirve docs/ como lo haría GitHub Pages, y las páginas de prueba desde aquí.
//
// Importado (arnes.mjs y las pruebas de interfaz): toma un puerto libre, así dos corridas a la vez no se pisan.
// Corrido solo (correr.mjs lo lanza con spawn): puerto fijo 8731, o el de la variable PUERTO.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { pathToFileURL } from "node:url";

const DOCS = join(import.meta.dirname, "..", "docs");
const AQUI = import.meta.dirname;
const TIPOS = { ".html":"text/html", ".js":"text/javascript", ".mjs":"text/javascript",
                ".css":"text/css", ".json":"application/json", ".png":"image/png", ".webp":"image/webp", ".svg":"image/svg+xml" };

export const servidor = createServer(async (req, res) => {
  let ruta = req.url.split("?")[0];
  if(ruta === "/") ruta = "/index.html";
  const base = ruta.startsWith("/prueba") ? AQUI : DOCS;
  try{
    const cuerpo = await readFile(join(base, ruta));
    res.writeHead(200, { "Content-Type": TIPOS[extname(ruta)] || "application/octet-stream",
                         "Service-Worker-Allowed": "/" });
    res.end(cuerpo);
  } catch(_){ res.writeHead(404); res.end("no está"); }
});

const solo = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
await new Promise((ok, mal) => {
  servidor.once("error", mal);
  servidor.listen(solo ? Number(process.env.PUERTO || 8731) : 0, "127.0.0.1", ok);
});
export const PUERTO = servidor.address().port;
export const URL_APP = `http://127.0.0.1:${PUERTO}/`;
if(solo) console.log("servidor en " + PUERTO);
