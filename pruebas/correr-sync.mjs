// Prueba el sincronizador de verdad: lo corre entero contra un Supabase de
// mentira y mira las notas que escribe.
//
// Copia sync/ y docs/ a una carpeta temporal para poner ahí el .env, porque
// sync.mjs lo lee de la raíz del proyecto. Así no hay manera de que una
// prueba deje un .env falso al lado del de verdad.
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdtemp, cp, writeFile, readFile, rm, mkdir, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const RAIZ = join(import.meta.dirname, "..");
let fallos = 0;
const dice = (b, t) => { console.log((b ? "  \x1b[32m✓\x1b[0m " : "  \x1b[31m✗\x1b[0m ") + t); if (!b) fallos++; };
const paso = t => console.log("\n\x1b[1m" + t + "\x1b[0m");

/* ---------- el taller de mentira ---------- */
const DIAGS = [
  { id: "d-completa", orden: "DX-01", fecha: "2026-09-01", estado: "entregado",
    veredicto: "no", conteo: { ok: 30, obs: 2, falla: 5, na: 0, sin: 0 },
    acciones: "Se retiró de servicio.", hallazgos: "Fuente con olor a quemado.",
    proximo_paso: "Retirar de servicio / reemplazar",
    autor_usuario: "lrivera", autor_nombre: "Luis Rivera", autor_grupo: "4-B", autor_escuela: "Escuela",
    equipo_serial: "ACER77", equipo_marca: "Acer", equipo_modelo: "Veriton",
    equipo_tipo: "Torre", equipo_inventario: "INV-990", equipo_ubicacion: "Salón 110",
    sistema: "Windows 10", entregado_en: "2026-09-01T18:00:00Z" },
  { id: "d-media", orden: "", fecha: "2026-09-01", estado: "entregado",
    veredicto: "apto", conteo: { ok: 25, obs: 0, falla: 0, na: 0, sin: 12 },
    acciones: "", hallazgos: "", proximo_paso: "Devolver a uso normal",
    autor_usuario: "mcolon", autor_nombre: "María Colón", autor_grupo: "4-B", autor_escuela: "Escuela",
    equipo_serial: "", equipo_marca: "", equipo_modelo: "",
    equipo_tipo: "", equipo_inventario: "", equipo_ubicacion: "",
    sistema: "", entregado_en: "2026-09-01T19:00:00Z" }
];
const PUNTOS_API = [
  { diagnostico_id: "d-completa", clave: "i0", grupo: "01", titulo: "Serial legible", estado: "ok", nota: "Verificado." },
  { diagnostico_id: "d-completa", clave: "i2", grupo: "01", titulo: "Cable de corriente", estado: "falla", nota: "Forro pelado." }
];
const PERFILES = [{ usuario: "lrivera", nombre: "Luis Rivera", grupo: "4-B", escuela: "Escuela", rol: "estudiante" }];
const EQUIPOS = [
  { serial: "ACER77", marca: "Acer", modelo: "Veriton", tipo: "Torre", inventario: "INV-990", ubicacion: "Salón 110" },
  { serial: "SINSALON", marca: "Asus", modelo: "ExpertBook", tipo: "Portátil", inventario: "", ubicacion: "" },
  // dos máquinas idénticas: lo normal en un laboratorio escolar
  { serial: "GEMELA-A", marca: "Dell", modelo: "OptiPlex 3080", tipo: "Torre", inventario: "INV-001", ubicacion: "Salón 204" },
  { serial: "GEMELA-B", marca: "Dell", modelo: "OptiPlex 3080", tipo: "Torre", inventario: "INV-002", ubicacion: "Salón 204" }
];
const RESPUESTAS = { vista_diagnosticos: DIAGS, puntos: PUNTOS_API, perfiles: PERFILES, equipos: EQUIPOS };

const pedidos = [];
const servidor = createServer((req, res) => {
  const recurso = req.url.split("?")[0].replace("/rest/v1/", "");
  pedidos.push({ recurso, auth: req.headers.authorization, apikey: req.headers.apikey });
  res.writeHead(RESPUESTAS[recurso] ? 200 : 404, { "Content-Type": "application/json" });
  res.end(JSON.stringify(RESPUESTAS[recurso] ?? { error: "no existe" }));
});
await new Promise(ok => servidor.listen(0, "127.0.0.1", ok));
const PUERTO = servidor.address().port;

/* ---------- montar la copia temporal ---------- */
const TMP = await mkdtemp(join(tmpdir(), "bitacora-sync-"));
await cp(join(RAIZ, "sync"), join(TMP, "sync"), { recursive: true });
await cp(join(RAIZ, "docs"), join(TMP, "docs"), { recursive: true });
const VAULT = join(TMP, "vault");
await mkdir(VAULT, { recursive: true });
await writeFile(join(TMP, ".env"),
  `SUPABASE_URL=http://127.0.0.1:${PUERTO}\nSUPABASE_SERVICE_KEY=llave-de-mentira\nVAULT_DIR=${VAULT}\n`);

// Asíncrono y no spawnSync: el servidor de mentira vive en este mismo
// proceso, y spawnSync bloquearía el bucle de eventos justo mientras el hijo
// está esperando respuesta. Se quedaban los dos mirándose.
const correr = args => new Promise(ok => {
  const p = spawn("node", [join(TMP, "sync", "sync.mjs"), ...args], { cwd: TMP });
  let salida = "", error = "";
  p.stdout.on("data", d => salida += d);
  p.stderr.on("data", d => error += d);
  p.on("close", status => ok({ status, salida, stderr: error }));
});

try {
  paso("Simulación: no escribe nada");
  const seco = await correr(["--dry"]);
  dice(seco.status === 0, "corre sin error" + (seco.status ? "\n" + seco.stderr : ""));
  dice(!existsSync(join(VAULT, "04-Diagnosticos")), "y no deja ni una carpeta creada");

  paso("Corrida de verdad");
  const r = await correr([]);
  dice(r.status === 0, "corre sin error" + (r.status ? "\n" + r.stderr : ""));
  dice(pedidos.some(p => p.recurso === "vista_diagnosticos"), "pide los diagnósticos");
  dice(pedidos.every(p => p.auth === "Bearer llave-de-mentira" && p.apikey === "llave-de-mentira"),
       "mandando la llave en cada petición");

  const completa = await readFile(join(VAULT, "04-Diagnosticos", "2026-09-01-DX-01-lrivera.md"), "utf8");
  const media = await readFile(join(VAULT, "04-Diagnosticos", "2026-09-01-d-media-mcolon.md"), "utf8");

  paso("La hoja completa");
  dice(/^salon: "Salón 110"$/m.test(completa), "lleva el salón, para poder agrupar por dónde está la máquina");
  dice(/^equipo_tipo: "Torre"$/m.test(completa), "y el tipo de equipo");
  dice(/^completa: true$/m.test(completa), "sale marcada como culminada");
  dice(/^falta: ""$/m.test(completa), "sin nada pendiente");
  dice(!/Falta culminar/.test(completa), "y sin el aviso");
  dice(/veredicto_texto: "No apto"/.test(completa), "con el veredicto en texto");
  dice(/\| Falla \| Cable de corriente \| Forro pelado\. \|/.test(completa), "y sus puntos con la nota");
  dice(/\[\[Acer Veriton \(ACER77\)\]\]/.test(completa),
       "y enlaza a la nota del equipo por su nombre con serial");

  paso("La hoja a medias");
  dice(/^completa: false$/m.test(media), "sale marcada como incompleta");
  dice(/el serial del equipo/.test(media) && /12 puntos sin evaluar/.test(media),
       "diciendo qué le falta, con la misma regla que la app");
  dice(/> \[!warning\] Falta culminar/.test(media), "y con el aviso visible en la nota");
  dice(/^salon: ""$/m.test(media), "sin salón, pero con el campo puesto para que Dataview no se atragante");

  paso("Notas de equipo y estudiante");
  const eq = await readFile(join(VAULT, "02-Equipos", "Acer Veriton (ACER77).md"), "utf8");
  const sin = await readFile(join(VAULT, "02-Equipos", "Asus ExpertBook (SINSALON).md"), "utf8");
  dice(/ubicacion: "Salón 110"/.test(eq), "el equipo lleva su salón");
  dice(/sin salón registrado/.test(sin), "y el que no lo tiene lo dice, en vez de quedar en blanco");

  paso("Dos máquinas del mismo modelo no se pisan");
  // El nombre de la nota llevaba solo marca y modelo, así que la segunda
  // Dell OptiPlex 3080 caía en el mismo archivo y, como las notas de equipo
  // no se sobreescriben, se descartaba entera con su historial.
  const notasEq = (await readdir(join(VAULT, "02-Equipos"))).filter(f => f.endsWith(".md"));
  dice(notasEq.length === EQUIPOS.length,
       `una nota por máquina, ${EQUIPOS.length} en total (vio ${notasEq.length}: ${notasEq.join(", ")})`);
  const a = await readFile(join(VAULT, "02-Equipos", "Dell OptiPlex 3080 (GEMELA-A).md"), "utf8");
  const b = await readFile(join(VAULT, "02-Equipos", "Dell OptiPlex 3080 (GEMELA-B).md"), "utf8");
  dice(/serial: "GEMELA-A"/.test(a) && /serial: "GEMELA-B"/.test(b), "cada una con su serial");
  dice(/inventario: "INV-001"/.test(a) && /inventario: "INV-002"/.test(b),
       "y su número de inventario, que es lo que se perdía");

  paso("Lo que el instructor escribe no se pierde");
  const notaEq = join(VAULT, "02-Equipos", "Acer Veriton (ACER77).md");
  await writeFile(notaEq, eq + "\n\nAnotación del instructor: revisar en enero.\n");
  const r2 = await correr([]);
  dice(r2.status === 0, "segunda corrida sin error");
  const eq2 = await readFile(notaEq, "utf8");
  dice(/revisar en enero/.test(eq2), "la nota del equipo NO se sobreescribe");
  const completa2 = await readFile(join(VAULT, "04-Diagnosticos", "2026-09-01-DX-01-lrivera.md"), "utf8");
  dice(completa2 === completa, "y la del diagnóstico sí es espejo, idéntica");
} finally {
  servidor.close();
  await rm(TMP, { recursive: true, force: true });
}

dice(!existsSync(join(RAIZ, ".env")), "la prueba no dejó ningún .env en el proyecto");
console.log(fallos ? `\n\x1b[31m${fallos} fallo(s)\x1b[0m` : "\n\x1b[32mTodo pasa\x1b[0m");
process.exit(fallos ? 1 : 0);
