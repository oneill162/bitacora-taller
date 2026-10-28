// Recinto (ITPR, San Juan, Manatí) y modo (claro, oscuro): estado, transición y piezas de interfaz.
//
// Todo el cambio de piel es un atributo en <html>: data-recinto y data-modo. No se vuelve a pintar nada;
// tokens.css y estilo.css hacen el resto. Este módulo no importa a ningún otro (nucleo.js y local.js se piden
// con import() solo cuando hace falta hablar con el perfil), así que no puede formar ciclos al cargar.
//
// Contrato completo en DISENO.md. Resumen:
//   iniciarCampus()                        una vez, antes del primer pintado (app.js)
//   recintoActual() / modoActual()         "itpr"|"sanjuan"|"manati"  /  "claro"|"oscuro"
//   aplicarRecinto(id)                     cambia sin animación y lo recuerda en este equipo
//   cambiarRecinto(id, origen?)            con la revelación y el aviso; origen = evento, elemento o {x,y}
//   alternarModo()                         claro <-> oscuro con fundido de 180 ms
//   sincronizarConPerfil(perfil)           el recinto del perfil manda; si está vacío se queda el local; una elección a propósito
//                                          que no llegó al perfil (sin señal, o antes de entrar) queda pendiente y se sube aquí
//   recintoRecordado()                     ¿alguien eligió un recinto en este equipo? (antes de eso ninguna tarjeta dice «Tu recinto»)
//   soltarPendiente() / soltarEntradas()   al salir (la elección pendiente es de quien salió) / antes de repintar #app
//   guardarEnPerfil(id)                    perfiles.recinto del usuario en sesión (en silencio sin señal)
//   tilesRecinto(opc) / selectorRecinto(opc)   { html, montar(raiz) }: las tarjetas de la entrada y del pie, y el chip de la barra
//   prepararEntradas(raiz) / ajustarTitulares(raiz)   movimiento de entrada y titulares que nunca se cortan
//   avisar(texto)                          el aviso aria-live (#toast)

export const RECINTOS = {
  itpr:    { id: "itpr",    nombre: "ITPR",     largo: "Sistema ITPR",        titulo: ["Revisa con", "método."],  mascota: "Todos los recintos", pie: "ITPR",      sub: "Taller de Tecnología · Sistema ITPR",
             aviso: "Ahora estás en el Sistema ITPR",         crest: "img/itpr-marca.webp", w: 320, h: 374, alt: "Marca del Instituto Tecnológico de Puerto Rico" },
  sanjuan: { id: "sanjuan", nombre: "San Juan", largo: "Recinto de San Juan", titulo: ["Revisa", "a fondo."], mascota: "Tiburones",          pie: "Tiburones", sub: "Taller de Tecnología · San Juan",
             aviso: "Ahora estás en el recinto de San Juan", crest: "img/tiburon.webp",     w: 538, h: 560, alt: "Escudo de los Tiburones, Recinto de San Juan" },
  manati:  { id: "manati",  nombre: "Manatí",   largo: "Recinto de Manatí",   titulo: ["Revisa con", "garra."],   mascota: "Pumas",              pie: "Pumas",     sub: "Taller de Tecnología · Manatí",
             aviso: "Ahora estás en el recinto de Manatí",   crest: "img/puma.webp",       w: 640, h: 508, alt: "Escudo de los Pumas, Recinto de Manatí" }
};
// el lema de cada recinto: el titular de la entrada (en dos renglones) y la línea que abre los héroes (data-r="lema")
for (const r of Object.values(RECINTOS)) r.lema = r.titulo.join(" ");
// color de la barra del sistema por recinto: [claro, oscuro] (el campo, que es lo que se ve arriba)
const TEMA = { itpr: ["#05568D", "#0B5E99"], sanjuan: ["#102A42", "#1E4365"], manati: ["#0C1A2E", "#10294D"] };
const LLAVE_R = "bitacora:recinto", LLAVE_M = "bitacora:modo", LLAVE_P = "bitacora:recinto-pendiente";

const root = document.documentElement;
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const valido = id => id === "itpr" || id === "sanjuan" || id === "manati";
const leer = k => { try { return localStorage.getItem(k); } catch (_) { return null; } };
const quitar = k => { try { localStorage.removeItem(k); } catch (_) { /* sin almacenamiento */ } };
const guardar = (k, v) => { try { localStorage.setItem(k, v); } catch (_) { /* sin almacenamiento: la pantalla funciona igual */ } };
const quieto = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const telefono = () => matchMedia("(max-width: 759px)").matches;
const f1 = n => n.toFixed(1);
const esc = s => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/* ---------------- estado ---------------- */
// ¿Este equipo ya tiene un recinto elegido (por alguien, a propósito)? Antes de eso ninguna tarjeta dice «Tu recinto».
export const recintoRecordado = () => valido(leer(LLAVE_R));
export const recintoActual = () => (valido(root.dataset.recinto) ? root.dataset.recinto : "itpr");
export const modoActual = () => (root.dataset.modo === "claro" || root.dataset.modo === "oscuro"
  ? root.dataset.modo : (matchMedia("(prefers-color-scheme: dark)").matches ? "oscuro" : "claro"));

function actualizarThemeColor() {
  const [claro, oscuro] = TEMA[recintoActual()];
  const explicito = root.dataset.modo === "claro" || root.dataset.modo === "oscuro";
  $$('meta[name="theme-color"]').forEach(m => {
    const deOscuro = /dark/.test(m.media || "");
    m.content = explicito ? (root.dataset.modo === "oscuro" ? oscuro : claro) : (deOscuro ? oscuro : claro);
  });
}

// Lo que cambia con el recinto y no es CSS: nombres, aria, tarjetas marcadas, el nombre gigante del pie.
function pintarTextos() {
  const id = recintoActual(), r = RECINTOS[id];
  for (const k of ["nombre", "largo", "mascota", "sub", "lema"]) $$(`[data-r="${k}"]`).forEach(e => { e.textContent = r[k]; });
  $$("[data-rec-btn]").forEach(b => b.setAttribute("aria-label", `Recinto: ${r.nombre}, cambiar`));
  $$("[data-swatch]").forEach(e => { e.dataset.recinto = id; });
  const elegido = recintoRecordado();
  $$(".tile-rec").forEach(b => b.setAttribute("aria-pressed", String(elegido && b.dataset.recinto === id)));
  $$(".entrada-cuerpo").forEach(e => e.classList.toggle("recordado", elegido));
  $$("[data-ir-recinto]").forEach(b => b.setAttribute("aria-checked", String(b.dataset.irRecinto === id)));
  $$(".pie").forEach(p => { p.dataset.nombre = r.pie; });
  $$("[data-modo-btn]").forEach(b => b.setAttribute("aria-pressed", String(modoActual() === "oscuro")));
}

export function aplicarRecinto(id, { recordar = true } = {}) {
  if (!valido(id)) return;
  try { root.dataset.recinto = id; } catch (_) { /* nada que hacer */ }
  if (recordar) guardar(LLAVE_R, id);
  pintarTextos();
  actualizarThemeColor();
}

/* ---------------- perfil ---------------- */
export async function guardarEnPerfil(id) {
  if (!valido(id)) return false;
  try {
    const { sb, estado, conectado, conCorte } = await import("./nucleo.js");
    const p = estado.perfil;
    if (!p || !conectado()) return false;                       // sin señal o sin sesión: en silencio
    const { error } = await conCorte(sb.from("perfiles").update({ recinto: id }).eq("id", p.id));
    if (error) return false;
    p.recinto = id;
    quitar(LLAVE_P);
    const local = await import("./local.js");
    await local.guardarMeta("perfil", p);
    return true;
  } catch (_) { return false; }
}

// El recinto del perfil gana cuando no está vacío, salvo que la persona haya elegido uno a propósito y no haya
// podido guardarse (sin señal, o antes de entrar): esa elección queda pendiente y se sube ahora. Lo que solo
// recuerda el equipo (el recinto de quien lo usó antes) nunca pasa al perfil de otra persona.
export function sincronizarConPerfil(perfil) {
  if (!perfil) return;
  const pendiente = leer(LLAVE_P);
  if (valido(pendiente) && "recinto" in perfil) { aplicarRecinto(pendiente); guardarEnPerfil(pendiente); return; }
  if (valido(perfil.recinto)) aplicarRecinto(perfil.recinto);
}
// Al salir, la elección pendiente es de quien salió, no de quien entra después.
export const soltarPendiente = () => quitar(LLAVE_P);

/* ---------------- aviso ---------------- */
let tAviso;
export function avisar(texto) {
  const el = document.getElementById("toast");
  if (!el) return;
  clearTimeout(tAviso);
  el.textContent = texto;
  requestAnimationFrame(() => el.classList.add("on"));
  tAviso = setTimeout(() => { el.classList.remove("on"); tAviso = setTimeout(() => { el.textContent = ""; }, 400); }, 3200);
}

/* ---------------- la revelación del cambio de recinto ----------------
   document.startViewTransition hace una foto de la pantalla vieja; la nueva queda viva debajo y se descubre con un
   clip-path que animamos a mano (WAAPI) desde el puntero. Cada recinto abre a su manera:
     ITPR      un círculo que crece desde el puntero
     San Juan  una cuchilla a 30° (la pendiente del logo ITPR) que se abre como rendija
     Manatí    tres zarpazos paralelos a 64° que se abren y se funden
   El filo de la revelación llega con el color de marca del recinto nuevo: ::view-transition-image-pair tiene
   fondo --marker y la capa vieja se recorta con el complemento de la forma ensanchada unos px.
   Menos de 600 ms de principio a fin. Sin path() en clip-path se usa el círculo sin filo; sin View Transitions
   el cambio es instantáneo; con movimiento reducido es un fundido de 180 ms. */
const PASOS = 26, BORDE = 10;
const easeOut = t => 1 - Math.pow(1 - t, 3.2);
const marcos = fn => Array.from({ length: PASOS + 1 }, (_, i) => ({ clipPath: fn(easeOut(i / PASOS)) }));
const rad = d => d * Math.PI / 180;
const VACIO = "inset(50%)";
const conPath = () => { try { return CSS.supports("clip-path", 'path("M0 0")'); } catch (_) { return false; } };

function geoCirculo(x, y, usarPath) {
  const W = innerWidth, H = innerHeight, R = Math.hypot(Math.max(x, W - x), Math.max(y, H - y)) + 4;
  return {
    dur: 400,
    nuevo: p => `circle(${f1(R * p)}px at ${f1(x)}px ${f1(y)}px)`,
    viejo: usarPath ? p => {
      const r = R * p + BORDE * Math.min(1, p * 6);
      if (r <= .5) return "inset(0)";
      const d = (2 * r).toFixed(1);
      return `path(evenodd,'M-2 -2H${W + 2}V${H + 2}H-2Z M${f1(x - r)} ${f1(y)}a${f1(r)} ${f1(r)} 0 1 0 ${d} 0a${f1(r)} ${f1(r)} 0 1 0 -${d} 0Z')`;
    } : null
  };
}
// Franjas paralelas que suben `ang` grados hacia la derecha, centradas en el puntero; `offs` = desplazamiento de cada una.
function geoFranjas(x, y, ang, offs, dur, retraso) {
  const W = innerWidth, H = innerHeight, L = Math.hypot(W, H) * 1.2;
  const d = [Math.cos(rad(ang)), -Math.sin(rad(ang))], n = [Math.sin(rad(ang)), Math.cos(rad(ang))];
  const P = (u, v) => `${f1(x + d[0] * u + n[0] * v)} ${f1(y + d[1] * u + n[1] * v)}`;
  const maxOff = Math.max(...offs.map(Math.abs));
  const V = Math.max(...[[0, 0], [W, 0], [0, H], [W, H]].map(([a, b]) => Math.abs((a - x) * n[0] + (b - y) * n[1]))) + maxOff + 6;
  const rect = (v0, v1) => `M${P(-L, v0)}L${P(L, v0)}L${P(L, v1)}L${P(-L, v1)}Z`;
  const intervalos = p => offs.map((o, i) => {
    const k = Math.max(0, Math.min(1, (p - i * retraso) / (1 - retraso * (offs.length - 1))));
    return [o - V * k, o + V * k];
  }).filter(([a, b]) => b - a > .01);
  return {
    dur,
    nuevo: p => { const iv = intervalos(p); return iv.length ? `path('${iv.map(([a, b]) => rect(a, b)).join("")}')` : VACIO; },
    viejo: p => {                                   // el complemento de las franjas ensanchadas: son las franjas que quedan entre ellas
      const e = BORDE * Math.min(1, p * 6), top = V + BORDE + 10;
      const iv = intervalos(p).map(([a, b]) => [a - e, b + e]).sort((a, b) => a[0] - b[0]);
      const unidos = [];
      for (const t of iv) { const u = unidos[unidos.length - 1]; if (u && t[0] <= u[1]) u[1] = Math.max(u[1], t[1]); else unidos.push([...t]); }
      const huecos = []; let ini = -top;
      for (const [a, b] of unidos) { if (a - ini > .5) huecos.push([ini, a]); ini = Math.max(ini, b); }
      if (top - ini > .5) huecos.push([ini, top]);
      return huecos.length ? `path('${huecos.map(([a, b]) => rect(a, b)).join("")}')` : VACIO;
    }
  };
}
const GEO = {
  itpr:    (x, y, usarPath) => geoCirculo(x, y, usarPath),
  sanjuan: (x, y) => geoFranjas(x, y, 30, [0], 420, 0),
  manati:  (x, y) => geoFranjas(x, y, 64, [-96, 0, 96], 440, .1)
};

// De dónde parte la revelación: el puntero si lo hay; con teclado, el centro del elemento activado.
function puntoDe(origen) {
  const centro = el => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };
  if (origen && typeof origen.x === "number" && typeof origen.y === "number" && !(origen instanceof Event)) return origen;
  if (origen instanceof Element) return centro(origen);
  if (origen instanceof Event) {
    if (origen.clientX || origen.clientY) return { x: origen.clientX, y: origen.clientY };
    const el = origen.target instanceof Element ? origen.target.closest("button,a,[role]") || origen.target : null;
    if (el) return centro(el);
  }
  return { x: innerWidth / 2, y: innerHeight / 2 };
}

// El escudo vuelve a llegar con la personalidad del recinto nuevo (trasladar y escalar parejo; jamás girar).
function rearmarLlegada() {
  root.classList.remove("llega");
  void root.offsetWidth;
  root.classList.add("llega");
  setTimeout(() => root.classList.remove("llega"), 1000);
}

// Las marcas oficiales no se pueden cruzar ni desvanecer sobre otro color (docs/img/LEEME.md). Mientras dura una transición se
// les da nombre de vista: salen de la foto de la página y van en capas propias encima, así el filo de la revelación pasa por
// debajo. Devuelve la función que les quita el nombre (solo si no hay una transición más nueva usándolas).
const MARCAS = ".placa-wrap, .sello, .placas-pie, .f-placa";
let alzadas;
function alzarMarcas() {
  const mias = alzadas = $$(MARCAS).filter(e => e.getClientRects().length);
  mias.forEach((e, i) => { e.style.viewTransitionName = "marca-" + i; });
  return () => { if (alzadas === mias) { mias.forEach(e => { e.style.viewTransitionName = ""; }); alzadas = null; } };
}

let vtModo;                                               // lo mismo para el cambio de modo
let vtActual;                                             // la transición en curso: una nueva salta a la anterior, que no limpia ni avisa
export function cambiarRecinto(id, origen) {
  if (!valido(id)) return;
  if (id === recintoActual()) {                           // tocar el recinto que ya se ve solo cuenta si todavía nadie lo había elegido
    if (!recintoRecordado()) { aplicarRecinto(id); guardar(LLAVE_P, id); guardarEnPerfil(id); avisar(RECINTOS[id].aviso); }
    return;
  }
  const aplicar = () => { try { aplicarRecinto(id); rearmarLlegada(); } catch (_) { root.dataset.recinto = id; } };
  const listo = () => { avisar(RECINTOS[id].aviso); };
  guardar(LLAVE_P, id);                                    // elección a propósito: si no llega al perfil ahora, llegará al volver la señal
  guardarEnPerfil(id);
  if (!document.startViewTransition) { aplicar(); listo(); return; }
  vtActual?.skipTransition();
  if (quieto()) {                                         // movimiento reducido: fundido corto, sin recorrido ni recorte
    root.classList.add("suave");
    const baja = alzarMarcas();
    const vt = vtActual = document.startViewTransition(aplicar);
    vt.finished.catch(() => {}).finally(() => { baja(); if (vtActual === vt) { root.classList.remove("suave"); listo(); } });
    return;
  }
  const { x, y } = puntoDe(origen);
  const usarPath = conPath();
  root.classList.add("revelando");
  const baja = alzarMarcas();
  const vt = vtActual = document.startViewTransition(aplicar);
  vt.ready.then(() => {
    const geo = (usarPath ? GEO[id] : GEO.itpr)(x, y, usarPath);
    const op = { duration: geo.dur, easing: "linear", fill: "both" };
    root.animate(marcos(geo.nuevo), { ...op, pseudoElement: "::view-transition-new(root)" });
    if (geo.viejo) root.animate(marcos(geo.viejo), { ...op, pseudoElement: "::view-transition-old(root)" });
  }).catch(() => {});
  vt.finished.catch(() => {}).finally(() => { baja(); if (vtActual === vt) { root.classList.remove("revelando"); listo(); } });
}

export function alternarModo() {
  const nuevo = modoActual() === "oscuro" ? "claro" : "oscuro";
  const poner = () => { root.dataset.modo = nuevo; guardar(LLAVE_M, nuevo); pintarTextos(); actualizarThemeColor(); };
  if (document.startViewTransition) {                     // fundido de 180 ms, también con movimiento reducido
    root.classList.add("suave");
    vtModo?.skipTransition();
    const baja = alzarMarcas();
    const vt = vtModo = document.startViewTransition(poner);
    vt.finished.catch(() => {}).finally(() => { baja(); if (vtModo === vt) root.classList.remove("suave"); });
  } else poner();
}

/* ---------------- piezas de interfaz ---------------- */
const IC = {
  caret: '<path d="m6 9 6 6 6-6"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>'
};
const svg = n => `<svg viewBox="0 0 24 24" aria-hidden="true">${IC[n]}</svg>`;

// Las tres tarjetas de recinto (entrada y pie). Cada botón lleva su data-recinto: trae su propia paleta.
export function tilesRecinto({ pie = false, leyenda } = {}) {
  const actual = recintoActual();
  const tiles = Object.values(RECINTOS).map(r => `
    <div class="rev"><button type="button" class="tile-rec" data-recinto="${r.id}" aria-pressed="${recintoRecordado() && r.id === actual}">
      <span class="f-placa"><img src="${r.crest}" alt="" width="${r.w}" height="${r.h}"></span>
      <span class="f-t"><b>${esc(r.nombre)}</b><small>${esc(r.mascota)}</small></span>
      <span class="tuyo">${svg("check")}Tu recinto</span>
    </button></div>`).join("");
  const html = `<fieldset class="elegir${pie ? " pie-rec" : ""}">
    <legend>${esc(leyenda || (pie ? "Cambiar de recinto" : "Elige tu recinto"))}</legend>
    <div class="tiles-rec" role="group" aria-label="Recinto">${tiles}</div></fieldset>`;
  return { html, montar() { pintarTextos(); } };
}

// El chip de la barra (muestra el NOMBRE del recinto) con su menú. En el teléfono abre una hoja de abajo (<dialog>).
let nSel = 0;
export function selectorRecinto({ conSalir = false } = {}) {
  const id = `menu-rec-${++nSel}`, actual = recintoActual(), r = RECINTOS[actual];
  const items = Object.values(RECINTOS).map(x => `
    <button type="button" role="menuitemradio" aria-checked="${x.id === actual}" data-ir-recinto="${x.id}">
      <span class="swatch" data-recinto="${x.id}" aria-hidden="true"></span><span><b>${esc(x.nombre)}</b><small>${esc(x.mascota)}</small></span>
      <span class="ok" aria-hidden="true">${svg("check")}</span></button>`).join("");
  const html = `<div class="recinto">
    <button class="rec-btn" type="button" data-rec-btn${conSalir ? " data-con-salir" : ""} aria-haspopup="menu" aria-expanded="false" aria-controls="${id}" aria-label="Recinto: ${esc(r.nombre)}, cambiar">
      <span class="swatch" data-swatch data-recinto="${actual}" aria-hidden="true"></span><span class="rec-n" data-r="nombre">${esc(r.nombre)}</span>${svg("caret")}
    </button>
    <div class="menu-rec" role="menu" id="${id}" aria-label="Recinto" hidden>${items}</div></div>`;
  return { html, montar() { pintarTextos(); } };
}

/* ---------------- piezas compartidas de pantalla ---------------- */
export const NOMBRE_VEREDICTO = { apto: "Apto", obs: "Con observaciones", no: "No apto", inc: "Incompleto", bor: "Borrador" };
// El glifo de un veredicto (apto | obs | no | inc | bor) o el de aviso (info), del sprite que está en index.html.
export const glifo = v => `<svg class="g" aria-hidden="true"><use href="#g-${esc(v)}"/></svg>`;
// El chip de estado: forma + glifo + palabra. `texto` es texto plano (se escapa); sin texto usa el nombre del veredicto.
export const chipEstado = (v, texto, grande = false) =>
  `<span class="estado${grande ? " estado-lg" : ""}" data-v="${esc(v)}">${glifo(v)}${esc(texto || NOMBRE_VEREDICTO[v] || "")}</span>`;
// La línea con el lema del recinto que abre un héroe (cambia con el recinto igual que los demás data-r).
export const lemaHero = () => `<p class="hero-lema rev" data-r="lema">${esc(RECINTOS[recintoActual()].lema)}</p>`;
// La ilustración de fondo del héroe (losas, aleta, zarpazos; solo se ve la del recinto activo).
export const ilustracion = () => `
  <div class="fondo-ilu" aria-hidden="true">
    <svg class="ilu ilu-itpr" viewBox="0 0 1000 440" preserveAspectRatio="xMaxYMax meet"><polygon class="f-up" points="300,440 1000,36 1000,440"/><polygon class="f-down" points="560,440 1000,186 1000,440"/></svg>
    <svg class="ilu ilu-sanjuan" viewBox="0 0 1000 440" preserveAspectRatio="xMaxYMax meet"><path class="f-up" d="M300 440C450 385 650 200 770 14c42 140 130 330 210 426z"/><path class="f-down" d="M610 440c80-40 170-150 230-250 22 90 70 190 110 250z"/><polygon class="f-mk" points="520,440 566,440 870,0 824,0"/></svg>
    <svg class="ilu ilu-manati" viewBox="0 0 1000 440" preserveAspectRatio="xMaxYMax meet"><polygon class="f-up" points="600,0 690,0 410,440"/><polygon class="f-mk" points="730,0 810,0 530,440"/><polygon class="f-up" points="850,0 930,0 650,440"/></svg>
  </div>`;
// La placa clara con el escudo del recinto, cortada a 30°. Va como último hijo de .hero.
export const placaHero = () => `
  <div class="placa-wrap"><div class="placa">${Object.values(RECINTOS).map(r =>
    `<img class="c-${r.id}" src="${r.crest}" alt="${esc(r.alt)}" width="${r.w}" height="${r.h}">`).join("")}</div></div>`;

/* ---------------- menú y hoja ---------------- */
function cerrarMenus(devolverFoco) {
  $$(".menu-rec").forEach(m => {
    if (m.hidden) return;
    m.hidden = true;
    const b = m.previousElementSibling;
    b.setAttribute("aria-expanded", "false");
    if (devolverFoco) b.focus();
  });
}
function abrirMenu(btn) {
  const m = btn.nextElementSibling, abre = m.hidden;
  cerrarMenus(false);
  if (!abre) return;
  m.hidden = false; btn.setAttribute("aria-expanded", "true");
  (m.querySelector('[aria-checked="true"]') || m.firstElementChild).focus();
}
function abrirHoja(btn) {
  let dlg = document.getElementById("dlg-recinto");
  if (!dlg) {
    dlg = document.createElement("dialog");
    dlg.id = "dlg-recinto"; dlg.className = "hoja-rec"; dlg.setAttribute("aria-labelledby", "dlg-recinto-t");
    // el fondo es el propio <dialog>: solo cierra un toque fuera de su caja, no en su relleno
    dlg.addEventListener("click", ev => {
      const r = dlg.getBoundingClientRect();
      if (ev.target === dlg && (ev.clientX < r.left || ev.clientX > r.right || ev.clientY < r.top || ev.clientY > r.bottom)) dlg.close();
    });
    document.body.appendChild(dlg);
  }
  const actual = recintoActual();
  dlg.innerHTML = `<h2 id="dlg-recinto-t">Cambiar de recinto</h2>
    <div class="ops" role="radiogroup" aria-label="Recinto">${Object.values(RECINTOS).map(x => `
      <button type="button" class="op" role="radio" aria-checked="${x.id === actual}" data-ir-recinto="${x.id}">
        <span class="swatch" data-recinto="${x.id}" aria-hidden="true"></span><span><b>${esc(x.nombre)}</b><small>${esc(x.mascota)}</small></span>
        <span class="ok" aria-hidden="true">${svg("check")}</span></button>`).join("")}</div>
    <div class="acc-fila">${btn.hasAttribute("data-con-salir") ? '<button type="button" class="btn tenue" data-salir>Salir</button>' : ""}
      <button type="button" class="btn tenue" data-cerrar-hoja>Cerrar</button></div>`;
  // en el teléfono el chip abre un diálogo, no un menú: que lo diga a los lectores de pantalla
  const ctl = btn.getAttribute("aria-controls");
  btn.setAttribute("aria-haspopup", "dialog"); btn.setAttribute("aria-controls", "dlg-recinto"); btn.setAttribute("aria-expanded", "true");
  dlg.addEventListener("close", () => {
    btn.setAttribute("aria-haspopup", "menu"); btn.setAttribute("aria-controls", ctl); btn.setAttribute("aria-expanded", "false");
  }, { once: true });
  if (typeof dlg.showModal === "function") dlg.showModal(); else dlg.setAttribute("open", "");
  (dlg.querySelector('[aria-checked="true"]') || dlg.querySelector("button")).focus();
}

function alClic(ev) {
  const t = ev.target instanceof Element ? ev.target.closest("button,a") : null;
  if (!t) { cerrarMenus(false); return; }
  if (t.matches("[data-rec-btn]")) { telefono() ? abrirHoja(t) : abrirMenu(t); return; }
  if (t.matches("[data-ir-recinto]")) {
    const id = t.dataset.irRecinto;
    const hoja = t.closest("dialog");
    if (hoja) { cerrarMenus(false); hoja.close(); } else cerrarMenus(true);   // la hoja devuelve el foco sola; el menú, a su botón
    cambiarRecinto(id, ev);
    return;
  }
  if (t.matches(".tile-rec")) { cambiarRecinto(t.dataset.recinto, ev); return; }
  if (t.matches("[data-modo-btn]")) { alternarModo(); return; }
  if (t.matches("[data-cerrar-hoja]")) { t.closest("dialog")?.close(); return; }
  if (t.matches("[data-salir]")) { t.closest("dialog")?.close(); document.dispatchEvent(new CustomEvent("bitacora:salir")); return; }
  if (!t.closest(".recinto")) cerrarMenus(false);
}

function alTeclado(ev) {
  if (ev.key === "Escape") { cerrarMenus(true); return; }
  const grupo = ev.target instanceof Element ? ev.target.closest(".menu-rec,[role=radiogroup]") : null;
  const btn = ev.target instanceof Element ? ev.target.closest("[data-rec-btn]") : null;
  if (btn && (ev.key === "ArrowDown" || ev.key === "ArrowUp") && btn.getAttribute("aria-expanded") === "false" && !telefono()) {
    ev.preventDefault(); abrirMenu(btn); return;
  }
  if (grupo && ["ArrowDown", "ArrowUp", "ArrowRight", "ArrowLeft", "Home", "End"].includes(ev.key)) {
    ev.preventDefault();                                   // solo mueve el foco: elegir es Enter o Espacio, no cada flecha
    const it = [...grupo.querySelectorAll("button")], i = it.indexOf(document.activeElement);
    const sig = ev.key === "Home" ? 0 : ev.key === "End" ? it.length - 1
      : (i + (ev.key === "ArrowDown" || ev.key === "ArrowRight" ? 1 : -1) + it.length) % it.length;
    it[sig].focus();
    return;
  }
  if (ev.key === "Tab" && grupo?.classList.contains("menu-rec")) cerrarMenus(false);
}

/* ---------------- movimiento de entrada y titulares ---------------- */
let io;
// pintar() reemplaza todo #app: lo que el observador seguía ya no existe. Se suelta antes de cada pintado.
export const soltarEntradas = () => { io?.disconnect(); };
export function prepararEntradas(raiz = document) {
  $$(".cap, .e-izq, .e-der", raiz).forEach(c => {
    let i = 0;
    $$(".rev, .linea", c).forEach(e => e.style.setProperty("--i", Math.min(i++, 7)));
  });
  const objetivos = $$(".rev, .linea, .col, .dona-aro, .hero, .e-izq", raiz);
  const ver = e => {
    e.classList.add("visto");
    if (e.matches(".hero, .e-izq")) e.classList.add("visto-ilu");
    if (e.matches(".rev")) setTimeout(() => e.classList.add("hecho"), 1600);   // la entrada terminó: vuelve el hover normal
  };
  if (!("IntersectionObserver" in window)) { objetivos.forEach(ver); return; }
  io = io || new IntersectionObserver(es => es.forEach(e => {
    if (!e.isIntersecting) return;
    ver(e.target); io.unobserve(e.target);
  }), { threshold: .14, rootMargin: "0px 0px -4% 0px" });
  objetivos.forEach(e => io.observe(e));
  // lo que ya está a la vista al entrar: la ilustración y la placa no esperan
  requestAnimationFrame(() => $$(".hero, .e-izq", raiz).forEach(e => e.classList.add("visto-ilu")));
  ajustarTitulares(raiz);
}

// Un titular con un nombre largo ("Guillermina") se achica por pasos hasta caber. Nunca se corta de lado.
// También cuenta que la caja del titular sea más ancha que su contenedor: una palabra más larga que el espacio
// (MAXIMILIANO a 44 px en un teléfono de 320) estira la caja y su contenido "cabe" en ella, así que scrollWidth no lo ve.
const disponible = h => { const p = h.parentElement, c = getComputedStyle(p); return p.clientWidth - parseFloat(c.paddingLeft) - parseFloat(c.paddingRight); };
const desborda = h => $$(".linea > span", h).some(s => s.scrollWidth > s.clientWidth + 1) || h.scrollWidth > h.clientWidth + 1 || h.offsetWidth > disponible(h) + 1;
export function ajustarTitulares(raiz = document) {
  $$(".h1", raiz).forEach(h => {
    h.style.removeProperty("--fit");
    h.classList.remove("parte");
    let fit = 1;
    for (let i = 0; i < 10 && desborda(h); i++) { fit = Math.max(.45, fit - .07); h.style.setProperty("--fit", fit.toFixed(2)); }
    if (desborda(h)) h.classList.add("parte");           // último recurso: partir la palabra en vez de cortarla
  });
}

/* ---------------- arranque ---------------- */
let iniciado = false;
export function iniciarCampus() {
  if (iniciado) return;
  iniciado = true;
  const r = leer(LLAVE_R), m = leer(LLAVE_M);
  aplicarRecinto(valido(r) ? r : recintoActual(), { recordar: false });
  if (m === "claro" || m === "oscuro") root.dataset.modo = m;
  actualizarThemeColor();
  document.addEventListener("click", alClic);
  document.addEventListener("keydown", alTeclado);
  try { matchMedia("(prefers-color-scheme: dark)").addEventListener("change", actualizarThemeColor); } catch (_) { /* navegador viejo */ }
  let raf;
  addEventListener("resize", () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => ajustarTitulares()); });
  document.fonts?.ready.then(() => ajustarTitulares());
}
