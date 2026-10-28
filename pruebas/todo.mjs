// Corre todas las pruebas una tras otra, cada una en su proceso (y cada proceso con su propio servidor en un puerto libre),
// y da un resumen. Sin dependencias: solo Node y, para las de interfaz, Playwright con Edge o Chrome ya instalados.
//
//   node pruebas/todo.mjs               todas
//   node pruebas/todo.mjs ui editor     solo las que contengan esos nombres (resumen, casco, ui, entrada, dashboard, tablero, editor, marcas, arreglos)
//   node pruebas/todo.mjs --rapidas     solo las que no abren navegador (resumen, casco)
//   node pruebas/todo.mjs --completo    sin atajos: matriz entera de tablero (30 contextos) y de marcas (4 anchos); tarda ~30 min
//
// Por defecto tablero corre con SIN_MATRIZ=1 y marcas con ANCHOS=390,1280 (las matrices completas también pasan).
// Sale con código 1 si alguna falla. Lo que cada una cubre está en el README (sección Pruebas).
import { spawn } from "node:child_process";
import { join } from "node:path";

const PRUEBAS = [
  { n: "resumen", f: "resumen.mjs", navegador: false, cubre: "cifras del dashboard (funciones puras)" },
  { n: "casco", f: "casco.mjs", navegador: false, cubre: "precache del service worker contra docs/" },
  { n: "ui", f: "ui.mjs", navegador: true, cubre: "chasis: entrada, barra, pie, recinto, modo, navegación, flujos" },
  { n: "entrada", f: "ui-entrada.mjs", navegador: true, cubre: "entrada, registro y Mis hojas" },
  { n: "dashboard", f: "ui-dashboard.mjs", navegador: true, cubre: "dashboard de estudiante e instructor, gráficas" },
  { n: "tablero", f: "ui-tablero.mjs", navegador: true, cubre: "tablero, informes, inventario, revisar, gente, cartel QR" },
  { n: "editor", f: "ui-editor.mjs", navegador: true, cubre: "hoja, reporte, calificación e impresión" },
  { n: "marcas", f: "marcas.mjs", navegador: true, cubre: "marcas oficiales en todas las pantallas" },
  { n: "arreglos", f: "ui-arreglos.mjs", navegador: true, cubre: "arreglos de la ronda de integración (carreras del tablero, marcas sin desvanecer, registro, avisos, teléfono)" }
];

const args = process.argv.slice(2);
const rapidas = args.includes("--rapidas");
const ATAJOS = args.includes("--completo") ? {} : { tablero: { SIN_MATRIZ: "1" }, marcas: { ANCHOS: process.env.ANCHOS || "390,1280" } };
const filtros = args.filter(a => !a.startsWith("--"));
const lista = PRUEBAS.filter(p => (!rapidas || !p.navegador) && (!filtros.length || filtros.some(x => p.n === x || p.n.includes(x))));
if (!lista.length) { console.log("Ninguna prueba coincide con " + filtros.join(", ")); process.exit(2); }

const resultados = [];
for (const p of lista) {
  const t0 = Date.now();
  process.stdout.write(`> ${p.n.padEnd(10)} ${p.cubre}\n`);
  const salida = await new Promise(ok => {
    let txt = "";
    const hijo = spawn(process.execPath, [join(import.meta.dirname, p.f)], { stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, ...ATAJOS[p.n] } });
    hijo.stdout.on("data", d => { txt += d; });
    hijo.stderr.on("data", d => { txt += d; });
    hijo.on("close", codigo => ok({ codigo, txt }));
  });
  const seg = ((Date.now() - t0) / 1000).toFixed(1);
  const ultima = salida.txt.trim().split("\n").filter(Boolean).pop() || "";
  resultados.push({ ...p, ok: salida.codigo === 0, seg, ultima });
  if (salida.codigo !== 0) console.log(salida.txt.trim().split("\n").slice(-40).join("\n"));
  console.log(`  ${salida.codigo === 0 ? "ok   " : "FALLA"} ${seg}s  ${ultima}`);
}

console.log("\nResumen");
for (const r of resultados) console.log(`  ${r.ok ? "ok   " : "FALLA"} ${r.n.padEnd(10)} ${r.seg.padStart(6)}s  ${r.ultima}`);
const malas = resultados.filter(r => !r.ok);
console.log(malas.length ? `\n${malas.length} de ${resultados.length} con fallas: ${malas.map(r => r.n).join(", ")}` : resultados.length === 1 ? "\nLa prueba pasó." : `\nLas ${resultados.length} pruebas pasaron.`);
process.exit(malas.length ? 1 : 0);
