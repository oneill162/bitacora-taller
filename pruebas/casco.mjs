// Comprueba el precache del service worker (docs/sw.js):
//   - todo lo que lista CASCO existe en docs/;
//   - todo archivo de docs/ está en CASCO (salvo sw.js y la nota docs/img/LEEME.md);
//   - lo que index.html, los módulos JS y las hojas CSS piden (link, script, import, url()) está en CASCO.
// Al publicar cambios hay que subir VERSION en sw.js: sin eso los teléfonos se quedan con la copia vieja.
//   node pruebas/casco.mjs
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, relative, dirname, posix } from "node:path";

const DOCS = join(import.meta.dirname, "..", "docs");
const sw = readFileSync(join(DOCS, "sw.js"), "utf8");
const version = sw.match(/const VERSION = "([^"]+)"/)?.[1];
const casco = [...sw.match(/const CASCO = \[([\s\S]*?)\];/)[1].matchAll(/"([^"]+)"/g)].map(m => m[1].replace(/^\.\//, ""));
const norm = u => (u === "" ? "" : posix.normalize(u));
const enCasco = new Set(casco.map(norm));
const problemas = [];

for (const u of casco) if (u !== "" && !existsSync(join(DOCS, u))) problemas.push(`CASCO lista ${u} y no existe`);

const todos = [];
(function recorrer(d) { for (const f of readdirSync(d)) { const p = join(d, f); statSync(p).isDirectory() ? recorrer(p) : todos.push(relative(DOCS, p).split("\\").join("/")); } })(DOCS);
const EXENTOS = new Set(["sw.js", "img/LEEME.md"]);
for (const f of todos) if (!EXENTOS.has(f) && !enCasco.has(f)) problemas.push(`${f} está en docs/ y falta en CASCO`);

// lo que cada archivo pide
const pide = (archivo, refs) => { for (const r of refs) { if (/^(https?:|data:|#|mailto:)/.test(r)) continue; const u = norm(posix.join(posix.dirname(archivo), r.split(/[?#]/)[0])); if (!enCasco.has(u) && !EXENTOS.has(u)) problemas.push(`${archivo} pide ${r} y no está en CASCO`); } };
for (const f of todos) {
  const t = f.match(/\.(js|css|html)$/) ? readFileSync(join(DOCS, f), "utf8") : "";
  if (f.endsWith(".html")) pide(f, [...t.matchAll(/(?:href|src)="([^"]+)"/g)].map(m => m[1]).filter(r => !r.startsWith("#")));
  if (f.endsWith(".css")) pide(f, [...t.matchAll(/url\(["']?([^)"']+)["']?\)/g)].map(m => m[1]));
  if (f.endsWith(".js") && f !== "sw.js") pide(f, [...t.matchAll(/(?:from|import\()\s*["'](\.[^"']+)["']/g)].map(m => m[1]));
  if (f.endsWith(".js") && f !== "sw.js") pide(f, [...t.matchAll(/src="(img\/[^"$]+)"/g)].map(m => m[1]));
}

console.log(`sw.js VERSION ${version}, ${casco.length} entradas en CASCO, ${todos.length} archivos en docs/.`);
if (problemas.length) { problemas.forEach(p => console.log("  FALLA", p)); process.exit(1); }
console.log("El precache coincide con docs/.");
