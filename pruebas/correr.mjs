import { spawn } from "node:child_process";
import { rm } from "node:fs/promises";
import { abrirNavegador, conectar } from "./cdp.mjs";

const dormir = ms => new Promise(r => setTimeout(r, ms));
const PERFIL = import.meta.dirname + "/.perfil-chromium";

const servidor = spawn("node", [import.meta.dirname + "/servidor.mjs"], { stdio:"inherit" });
await dormir(600);

await rm(PERFIL, { recursive:true, force:true });
const { cr, version } = await abrirNavegador(PERFIL);
const nav = conectar(version.webSocketDebuggerUrl);
await nav.listo;

const { targetId } = await nav.enviar("Target.createTarget", { url:"about:blank" });
const { sessionId } = await nav.enviar("Target.attachToTarget", { targetId, flatten:true });
const ev = (m, p = {}) => nav.enviar(m, p, sessionId);

const consola = [];
await ev("Runtime.enable");
await ev("Page.enable");
await ev("Network.enable");
nav.al(m => {
  if(m.method === "Runtime.consoleAPICalled")
    consola.push(m.params.args.map(a => a.value ?? a.description).join(" "));
  if(m.method === "Runtime.exceptionThrown")
    consola.push("EXCEPCIÓN: " + (m.params.exceptionDetails.exception?.description
                                  || m.params.exceptionDetails.text));
});

async function evaluar(expr){
  const r = await ev("Runtime.evaluate", { expression: expr, awaitPromise:true, returnByValue:true });
  if(r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
}

let fallos = 0;
const cabecera = t => console.log("\n\x1b[1m" + t + "\x1b[0m");

/* ============ 1. la lógica de guardado y subida ============ */
await ev("Page.navigate", { url:"http://127.0.0.1:8731/prueba.html" });
await dormir(1200);
for(let i = 0; i < 40 && !(await evaluar("window.listo === true")); i++) await dormir(150);

cabecera("Guardado local y sincronización");
for(const r of await evaluar("window.correr()")){
  if(r.ok) console.log("  \x1b[32m✓\x1b[0m " + r.nombre);
  else { fallos++; console.log("  \x1b[31m✗\x1b[0m " + r.nombre + "\n    " + r.error.replace(/\n/g, "\n    ")); }
}

/* ============ 2. la app abre sin señal ============ */
cabecera("La app abre sin señal");
await ev("Page.navigate", { url:"http://127.0.0.1:8731/index.html" });
await dormir(3500);   // que el service worker instale y guarde el casco

const sw = await evaluar(`(async () => {
  const rs = await navigator.serviceWorker.getRegistrations();
  // por nombre y no por versión: subir VERSION en sw.js no puede romper la prueba
  const nombre = (await caches.keys()).find(n => n.startsWith("bitacora-"));
  const c = await caches.open(nombre || "bitacora-");
  const k = await c.keys();
  return { registrado: rs.length > 0, guardados: k.map(r => new URL(r.url).pathname + "|" + new URL(r.url).host) };
})()`);
const dice = (b, t) => { if(b) console.log("  \x1b[32m✓\x1b[0m " + t);
                         else { fallos++; console.log("  \x1b[31m✗\x1b[0m " + t); } };

dice(sw.registrado, "el service worker queda registrado");
for(const f of ["/index.html","/app.js","/local.js","/estilo.css","/protocolo.js","/config.js","/vendor/supabase.js"])
  dice(sw.guardados.some(g => g.startsWith(f + "|")), `guarda copia de ${f}`);
dice(!sw.guardados.some(g => g.includes("jsdelivr")), "ya no depende de ningún CDN para la librería");

// ahora sí: cortar la red y recargar
await ev("Network.emulateNetworkConditions",
         { offline:true, latency:0, downloadThroughput:-1, uploadThroughput:-1, connectionType:"none" });
await ev("Page.navigate", { url:"http://127.0.0.1:8731/index.html" });
await dormir(3000);

// Chromium pierde el override de "sin conexión" al navegar, así que hay que
// volver a ponerlo antes de preguntar. La carga anterior sí ocurrió con la red
// cortada: por eso vale como prueba de que la app abre del cache.
await ev("Network.emulateNetworkConditions",
         { offline:true, latency:0, downloadThroughput:-1, uploadThroughput:-1, connectionType:"none" });
await dormir(300);

const sinRed = await evaluar(`({
  online: navigator.onLine,
  titulo: document.querySelector("#app h1")?.textContent || "",
  cargando: document.body.innerText.includes("Cargando la bitácora"),
  vacio: document.querySelector("#app").innerHTML.trim().length < 40
})`);
dice(!sinRed.online, "el navegador se reporta sin conexión");
dice(!sinRed.vacio && !sinRed.cargando, "la app se pinta igual (no queda en blanco ni en 'Cargando')");
dice(sinRed.titulo.includes("Bitácora"), `llega a la pantalla de entrar (vio: "${sinRed.titulo}")`);

/* ============ 3. el wifi de la escuela: conectado y sin salida ============ */
cabecera("Wifi conectado pero Supabase inalcanzable");
await ev("Network.emulateNetworkConditions",
         { offline:false, latency:0, downloadThroughput:-1, uploadThroughput:-1, connectionType:"wifi" });

// se siembra el perfil como si el estudiante ya hubiera entrado antes aquí
await ev("Page.navigate", { url:"http://127.0.0.1:8731/index.html" });
await dormir(2000);
await evaluar(`(async () => {
  const local = await import("./local.js");
  await local.guardarMeta("perfil", { id:"A-1", usuario:"mcolon", nombre:"María Colón",
                                      grupo:"4-B", escuela:"Taller", rol:"estudiante" });
  await local.guardarDiag({ id: local.nuevoId(), autor_id:"A-1", fecha:"2026-09-01",
                            orden:"DX-260901-01", estado:"borrador", veredicto:"", conteo:{},
                            acciones:"cambio de pasta térmica", hallazgos:"", proximo_paso:"" });
})()`);

// se corta SOLO Supabase: navigator.onLine sigue diciendo que hay internet
await ev("Network.setBlockedURLs", { urls:["*supabase.co*"] });
await ev("Page.navigate", { url:"http://127.0.0.1:8731/index.html" });
await dormir(7000);

const escuela = await evaluar(`({
  online: navigator.onLine,
  titulo: document.querySelector("#app h1")?.textContent || "",
  conexion: document.querySelector("#conexion")?.textContent || "",
  hojas: document.querySelectorAll("[data-abrir]").length,
  puedeSeguir: document.body.innerText.includes("Nuevo diagnóstico")
})`);
dice(escuela.online, "navigator.onLine sigue diciendo que sí (esa es la mentira a cubrir)");
dice(escuela.titulo.includes("Mis diagn"),
     'abre la bitácora del estudiante y no lo manda a entrar (vio: "' + escuela.titulo + '")');
dice(escuela.hojas === 1, "le enseña su hoja guardada (vio " + escuela.hojas + ")");
dice(escuela.puedeSeguir, "y lo deja empezar otro diagnóstico");
dice(/sin subir|Sin conexi/i.test(escuela.conexion),
     'avisa de lo que falta subir (vio: "' + escuela.conexion + '")');

// Y ahora el ciclo completo con la app de verdad, sin señal: llenar una hoja,
// volver al panel y reabrirla. Aquí es donde se perdían los datos del equipo.
const teclear = `(async () => {
  const ev = (el, t) => el.dispatchEvent(new Event(t, { bubbles:true }));
  const dormir = ms => new Promise(r => setTimeout(r, ms));
  document.querySelector("#b-nuevo").click();
  await dormir(400);
  for(const [id, v] of [["e-serial","ABC1234"],["e-marca","Dell"],["e-modelo","OptiPlex 3080"],
                        ["e-tipo","Torre de escritorio"],["e-inventario","INV-00842"],
                        ["e-ubicacion","Salón 204"],["d-usuario_equipo","Salón 204"]]){
    const el = document.querySelector("#" + id);
    el.value = v; ev(el, "input");
  }
  const radio = document.querySelector('[data-punto][value="ok"]');
  radio.checked = true; ev(radio, "change");
  await dormir(2000);                       // autoguardado (800ms) y subida fallida
  document.querySelector("#b-volver").click();
  await dormir(2500);
  const tarjeta = document.querySelector("[data-abrir]");
  if(!tarjeta) return { error: "la hoja no aparece en el panel" };
  tarjeta.click();
  await dormir(1500);
  const leer = id => document.querySelector("#" + id)?.value ?? null;
  return { serial: leer("e-serial"), marca: leer("e-marca"), tipo: leer("e-tipo"),
           inventario: leer("e-inventario"), ubicacion: leer("e-ubicacion"),
           usuario_equipo: leer("d-usuario_equipo"),
           punto: document.querySelector('[data-punto][value="ok"]')?.checked ?? null };
})()`;
const vuelta = await evaluar(teclear);
dice(!vuelta.error, "la hoja llenada sin señal aparece en el panel");
dice(vuelta.serial === "ABC1234", `el serial vuelve (vio: "${vuelta.serial}")`);
dice(vuelta.tipo === "Torre de escritorio", `el tipo vuelve (vio: "${vuelta.tipo}")`);
dice(vuelta.inventario === "INV-00842", `el inventario vuelve (vio: "${vuelta.inventario}")`);
dice(vuelta.ubicacion === "Salón 204", `la ubicación vuelve (vio: "${vuelta.ubicacion}")`);
dice(vuelta.usuario_equipo === "Salón 204", `lo de la hoja vuelve (vio: "${vuelta.usuario_equipo}")`);
dice(vuelta.punto === true, "y el punto marcado sigue marcado");

await ev("Network.setBlockedURLs", { urls:[] });

/* ============ 4. Supabase nunca se guarda en cache ============ */
cabecera("Los datos de estudiantes no se cachean");
const cache = await evaluar(`(async () => {
  // por nombre y no por versión: subir VERSION en sw.js no puede romper la prueba
  const nombre = (await caches.keys()).find(n => n.startsWith("bitacora-"));
  const c = await caches.open(nombre || "bitacora-");
  return (await c.keys()).filter(r => r.url.includes("supabase.co")).length;
})()`);
dice(cache === 0, "no hay ni una respuesta de supabase.co en el cache");

if(consola.filter(c => c.startsWith("EXCEPCI")).length){
  cabecera("Excepciones en la consola del navegador");
  consola.filter(c => c.startsWith("EXCEPCI")).forEach(c => console.log("  " + c));
}

console.log(fallos ? `\n\x1b[31m${fallos} fallo(s)\x1b[0m` : "\n\x1b[32mTodo pasa\x1b[0m");
nav.cerrar(); cr.kill(); servidor.kill();
process.exit(fallos ? 1 : 0);
