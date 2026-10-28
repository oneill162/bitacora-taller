// Pruebas del área "Tablero, informes y gestión": el día, informes, inventario, revisar, gente y el cartel del código QR.
//   node pruebas/ui-tablero.mjs            (Edge o Chrome ya instalados, Supabase de mentira de arnes.mjs)
//   CAPTURAS=1 node pruebas/ui-tablero.mjs  además guarda capturas en .diseno/area-tablero/shots/
//
// Cubre: las pantallas pintan en los 3 recintos y los 2 modos sin errores de consola; sin desborde horizontal a 320/375/390/768/1280
// (scrollWidth y un scrollTo real); controles de >= 44px en teléfono; movimiento reducido; auditoría de marcas oficiales
// (sin giro, sin recorte, sin deformar, tamaño mínimo); y las interacciones de esta área.
import assert from "node:assert/strict";
import { join } from "node:path";
import { mkdirSync } from "node:fs";

const { pixelesDistintos } = await import("./auditoria-marcas.mjs");
const { nuevaPagina, entrar, prueba, terminar, PERFILES, EQUIPOS, DIAGS, HOY, escrituras, navegador, URL_APP } = await import("./arnes.mjs");

const SHOTS = join(import.meta.dirname, "..", ".diseno", "area-tablero", "shots");
if (process.env.CAPTURAS) mkdirSync(SHOTS, { recursive: true });

/* ---------------- datos de ejemplo más ricos que los del arnés ---------------- */
const hace = min => new Date(Date.now() - min * 60000).toISOString();
EQUIPOS.push(
  { id: "q3", serial: "PF3M5T7R", marca: "Lenovo", modelo: "ThinkCentre", tipo: "", inventario: "INV-3", ubicacion: "Lab 3", creado_por: "e1" },
  { id: "q4", serial: "NXHF8AA002", marca: "Acer", modelo: "Aspire 5", tipo: "", inventario: "INV-4", ubicacion: "Lab 3", creado_por: "e2" },
  { id: "q5", serial: "abc-1234", marca: "HP", modelo: "ProBook", tipo: "", inventario: "INV-1", ubicacion: "Salón 204", creado_por: "e3" });   // duplicado de ABC1234
DIAGS.push(
  { id: "d3", autor_id: "e1", equipo_id: "q3", orden: "DX-3", fecha: HOY, estado: "borrador", veredicto: "", conteo: { ok: 10, obs: 2, falla: 0, na: 0, sin: 25 },
    sistema: "", hallazgos: "", nota: null, actualizado_en: hace(12), equipos: EQUIPOS[2] },
  { id: "d4", autor_id: "e2", equipo_id: "q4", orden: "DX-4", fecha: HOY, estado: "entregado", veredicto: "no", conteo: { ok: 30, obs: 2, falla: 5, na: 0, sin: 0 },
    sistema: "Windows 10", hallazgos: "Disco dañado", nota: 70, actualizado_en: hace(3), equipos: EQUIPOS[3] });
PERFILES.push(
  { id: "i2", usuario: "prof2", nombre: "Prof Dos", grupo: "TESI 2", escuela: "Plantel", rol: "instructor", es_superusuario: false, solicita_instructor: false, email: "", recinto: "itpr" },
  { id: "e4", usuario: "xss", nombre: "<img src=x onerror=window.__xss=1>", grupo: "TESI 2", rol: "estudiante", email: "", solicita_instructor: false, recinto: "" });

const MIN = { "tiburon.webp": 72, "puma.webp": 64, "itpr-marca.webp": 24, "itpr-manati.webp": 160, "itpr-manati-claro.webp": 160, "depr.webp": 140 };
const RECINTOS = process.env.RECINTOS?.split(",") || ["itpr", "sanjuan", "manati"], MODOS = process.env.MODOS?.split(",") || ["claro", "oscuro"], ANCHOS = process.env.ANCHOS?.split(",").map(Number) || [320, 375, 390, 768, 1280];

/* ---------------- ayudas ---------------- */
async function abrir(page, { recinto = "sanjuan", modo = "claro", quien = "prof" } = {}) {
  PERFILES.find(p => p.usuario === quien).recinto = recinto;      // el recinto del perfil manda sobre el del equipo
  await page.addInitScript(([r, m]) => { try { localStorage.setItem("bitacora:recinto", r); localStorage.setItem("bitacora:modo", m); } catch (_) {} }, [recinto, modo]);
  await entrar(page, quien);
}
const IR = { hoy: ".t-fila", informes: "#cuerpo-informe .gt, #cuerpo-informe table", inventario: "#cuerpo-inventario table", revisar: "#cuerpo-revisar .h3", gente: "#f-nuevo-est" };
async function irTaller(page, pestana = "hoy") {
  if (await page.locator("#p-gente").count() === 0) {
    await page.click('[data-nav="instructor"]:visible');
    await page.waitForSelector("#p-gente");
    await page.waitForSelector(".t-fila");
  }
  if (pestana !== "hoy") await page.click("#p-" + pestana);
  await page.waitForSelector(IR[pestana]);
}
async function irCodigo(page) {
  await page.click('[data-nav="inicio"]:visible');
  await page.waitForSelector("#d-codigo");
  await page.click("#d-codigo");
  await page.waitForSelector("#qr svg");
}
const desborde = page => page.evaluate(() => {
  window.scrollTo(300, 0);
  const movido = window.scrollX;
  window.scrollTo(0, 0);
  return { ancho: document.documentElement.scrollWidth, ventana: window.innerWidth, movido };
});
const recorrer = async page => {
  await page.evaluate(async () => { const h = document.documentElement.scrollHeight; for (let y = 0; y < h; y += 300) { scrollTo(0, y); await new Promise(f => setTimeout(f, 50)); } scrollTo(0, 0); });
  await page.waitForTimeout(1700);
};
// controles de la pantalla (no la barra, que es del chasis) con menos de 44px de alto
const pequenos = page => page.evaluate(() => [...document.querySelectorAll(
  'main button, main input:not([type=checkbox]):not([type=radio]), main select, main textarea, main a[href], main [role=button]')]
  .filter(e => !e.closest(".sr") && !e.classList.contains("salto") && !e.closest("[hidden]") && !e.closest("tr[role=button]"))
  .map(e => ({ e, r: e.getBoundingClientRect() })).filter(({ r }) => r.width > 0 && r.height > 0 && r.height < 43.5)
  .map(({ e, r }) => `${e.tagName.toLowerCase()}${e.id ? "#" + e.id : ""}.${[...e.classList].join(".")} ${Math.round(r.width)}x${Math.round(r.height)}`));

// auditoría de marcas oficiales (misma lógica que marcas.mjs): sin giro, sin recorte, sin deformar, tamaño mínimo
async function marcas(page) {
  const logos = await page.evaluate(() => [...document.querySelectorAll("img")].filter(i => /\/img\/(tiburon|puma|itpr-marca|itpr-manati|itpr-manati-claro|depr)\.webp/.test(i.src)).map((img, n) => {
    const r = img.getBoundingClientRect(), cs = getComputedStyle(img);
    if (!r.width || !r.height || cs.visibility === "hidden") return null;
    img.dataset.auditoria = String(n);
    const cadena = []; for (let e = img; e && e !== document.documentElement; e = e.parentElement) cadena.push(e);
    const pb = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight), bb = parseFloat(cs.borderLeftWidth) + parseFloat(cs.borderRightWidth);
    const fit = cs.objectFit === "contain" || cs.objectFit === "scale-down" ? 0 : Math.abs((r.width - pb - bb) / (r.height - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom) - parseFloat(cs.borderTopWidth) - parseFloat(cs.borderBottomWidth)) / (img.naturalWidth / img.naturalHeight) - 1);
    return { n, archivo: img.src.split("/").pop(), w: r.width, desvio: fit,
      transforms: cadena.map(e => getComputedStyle(e).transform).filter(t => t !== "none"),
      recortes: cadena.filter(e => getComputedStyle(e).clipPath !== "none").length };
  }).filter(Boolean));
  const mal = [];
  for (const l of logos) {
    if (l.transforms.length) mal.push(`${l.archivo}: transform en la marca o un ancestro (${l.transforms.join(" | ")})`);
    if (l.desvio > .01) mal.push(`${l.archivo}: deformada ${(l.desvio * 100).toFixed(1)} %`);
    if (l.w < MIN[l.archivo] - .5) mal.push(`${l.archivo}: ancho ${l.w.toFixed(0)} < mínimo ${MIN[l.archivo]}`);
    if (l.recortes) {
      const el = page.locator(`img[data-auditoria="${l.n}"]`);
      await el.scrollIntoViewIfNeeded();
      // solo cuentan los píxeles de la imagen: se quitan los fondos de la placa y de la página para que un clip-path
      // que corta una esquina vacía de la caja (el chaflán de la placa) no se tome por un recorte de la marca
      await page.evaluate(n => { const i = document.querySelector(`img[data-auditoria="${n}"]`); for (let e = i; e; e = e.parentElement) { e.dataset.bg = "1"; e.style.setProperty("background", "transparent", "important"); e.style.setProperty("box-shadow", "none", "important"); e.style.setProperty("transition", "none", "important"); } }, l.n);
      const a = await el.screenshot();
      await page.evaluate(n => { const i = document.querySelector(`img[data-auditoria="${n}"]`); for (let e = i; e && e !== document.documentElement; e = e.parentElement) if (getComputedStyle(e).clipPath !== "none") { e.dataset.cp = "1"; e.style.setProperty("clip-path", "none", "important"); } }, l.n);
      const b = await el.screenshot();
      await page.evaluate(() => { document.querySelectorAll("[data-cp]").forEach(e => { e.style.removeProperty("clip-path"); delete e.dataset.cp; }); document.querySelectorAll("[data-bg]").forEach(e => { e.style.removeProperty("background"); e.style.removeProperty("box-shadow"); e.style.removeProperty("transition"); delete e.dataset.bg; }); });
      if (await pixelesDistintos(page, a, b) > 2) mal.push(`${l.archivo}: un clip-path de un ancestro recorta la marca`);
    }
  }
  await page.evaluate(() => scrollTo(0, 0));
  return { mal, cuenta: logos.length };
}

/* ---------------- 1. pantallas x recintos x modos x anchos ---------------- */
const PANTALLAS = [
  ["hoy", async p => irTaller(p, "hoy")],
  ["informes-estudiante", async p => { await irTaller(p, "informes"); await p.click('[data-informe="estudiante"]'); await p.waitForSelector("#cuerpo-informe .gt"); }],
  ["informes-grupo", async p => { await p.click('[data-informe="grupo"]'); await p.waitForSelector("#cuerpo-informe table"); }],
  ["informes-salon", async p => { await p.click('[data-informe="salon"]'); await p.waitForSelector("#cuerpo-informe table"); }],
  ["informes-incompletos", async p => { await p.click('[data-informe="incompletos"]'); await p.waitForSelector(".grupo-falta"); }],
  ["informes-todas", async p => { await p.click('[data-informe="todo"]'); await p.waitForSelector("#tb tr"); }],
  ["inventario", async p => { await p.click("#p-inventario"); await p.waitForSelector("#cuerpo-inventario table"); }],
  ["revisar", async p => { await p.click("#p-revisar"); await p.waitForSelector("#cuerpo-revisar .dup"); }],
  ["gente", async p => { await p.click("#p-gente"); await p.waitForSelector("#f-nuevo-est"); }],
  ["codigo", async p => irCodigo(p)]
];
console.log("Pantallas x recintos x modos x anchos");
for (const recinto of RECINTOS) for (const modo of MODOS) for (const ancho of (process.env.SIN_MATRIZ ? [] : ANCHOS)) {
  await prueba(`${recinto} ${modo} ${ancho}px: las 10 pantallas, sin errores, sin desborde, controles y marcas`, async () => {
    const movil = ancho < 500;
    const { ctx, page, errores } = await nuevaPagina({ viewport: { width: ancho, height: movil ? 800 : 900 }, ...(movil ? { isMobile: true, hasTouch: true } : {}) });
    const fallas = [];
    try {
      await abrir(page, { recinto, modo });
      for (const [nombre, ir] of PANTALLAS) {
        await ir(page);
        const d0 = await desborde(page);                                    // justo al pintar: antes de que terminen las entradas
        if (d0.ancho > d0.ventana + 1 || d0.movido) fallas.push(`${nombre}: desborde al pintar (${d0.ancho} > ${d0.ventana}, scrollX ${d0.movido})`);
        await recorrer(page);
        const d1 = await desborde(page);
        if (d1.ancho > d1.ventana + 1 || d1.movido) fallas.push(`${nombre}: desborde tras las entradas (${d1.ancho} > ${d1.ventana}, scrollX ${d1.movido})`);
        if (movil) { const p = await pequenos(page); if (p.length) fallas.push(`${nombre}: controles < 44px: ${p.slice(0, 4).join("; ")}`); }
        if (nombre === "hoy" || nombre === "codigo") {
          const m = await marcas(page);
          if (!m.cuenta) fallas.push(`${nombre}: no se vio ninguna marca oficial`);
          m.mal.forEach(x => fallas.push(`${nombre}: ${x}`));
        }
        if (process.env.CAPTURAS && (ancho === 390 || ancho === 1280) && ["hoy", "informes-estudiante", "informes-incompletos", "gente", "codigo"].includes(nombre))
          await page.screenshot({ path: join(SHOTS, `${nombre}-${recinto}-${modo}-${ancho}.png`), fullPage: true });
      }
      if (errores.length) fallas.push("errores de consola: " + errores.join(" | "));
    } finally { await ctx.close(); }
    assert.equal(fallas.length, 0, fallas.slice(0, 5).join(" || "));
  });
}

if (process.env.SOLO_MATRIZ) await terminar();

/* ---------------- 2. el día ---------------- */
await prueba("el día: filas con barra, cuenta, chip de estado, hora relativa y chapa; filtros y grupo", async () => {
  const { ctx, page, errores } = await nuevaPagina();
  await abrir(page);
  await irTaller(page);
  assert.ok(await page.locator(".t-fila .t-av i").count() >= 3, "falta la barra de avance");
  assert.ok(await page.locator(".t-fila .chapa").count() >= 3, "faltan las chapas con iniciales");
  assert.match(await page.locator(".t-fila .t-c").first().textContent(), /\d+\/37|—/);
  const hoy = await page.locator("#taller-cuerpo").textContent();
  assert.match(hoy, /hace \d+ (min|h)/, "falta la hora relativa del borrador");   // el borrador se actualizó hace 12 min al cargar la prueba; si corre un buen rato dice 25, 40...
  assert.match(hoy, /Sin empezar/);
  assert.equal(await page.locator('.t-fila[data-v="inc"] .estado[data-v="inc"]').count() >= 1, true, "la hoja incompleta lleva su chip");
  assert.equal(await page.locator('.t-fila[data-v="inc"] .estado[data-v="inc"] svg use').first().getAttribute("href"), "#g-inc");
  assert.equal(await page.locator(".pill, .exclama, .fila-falta").count(), 0, "no deben quedar las marcas viejas");
  // la cuarta cifra: cuentan las hojas y los que no han empezado
  const rd = (await page.locator("#resumen-dia .rd").allTextContents()).map(t => t.replace(/\s+/g, " ").trim());
  assert.deepEqual(rd.map(t => t.replace(/^\d+/, "")), ["Entregadas", "Incompletas", "En progreso", "Sin empezar"]);
  // filtros
  await page.click('#filtros-dia [data-f="inc"]');
  assert.equal(await page.locator('#filtros-dia [data-f="inc"]').getAttribute("aria-pressed"), "true");
  assert.ok(await page.locator("#taller-cuerpo .t-fila").count() >= 1);
  assert.equal(await page.locator('#taller-cuerpo .t-fila[data-v="apto"]').count(), 0, "el filtro Incompletas no debe dejar hojas aptas");
  await page.click('#filtros-dia [data-f="sin"]');
  assert.match(await page.locator("#taller-cuerpo").textContent(), /Guillermina/);
  assert.equal(await page.locator("#taller-cuerpo .t-fila[data-ajena]").count(), 0);
  await page.click('#filtros-dia [data-f="bor"]');
  assert.match(await page.locator("#taller-cuerpo").textContent(), /Borrador/);
  await page.click('#filtros-dia [data-f="todo"]');
  await page.selectOption("#ta-grupo", "TESI 2");
  assert.ok(await page.locator("#taller-cuerpo .t-fila").count() >= 4);
  // abrir una hoja ajena: es el reporte de solo lectura
  await page.click("#taller-cuerpo [data-ajena]");
  await page.waitForSelector('main[data-vista="reporte"]');
  assert.deepEqual(errores, []);
  await ctx.close();
});

await prueba("el día: la cifra Entregadas y el filtro Entregadas cuentan lo mismo (la hoja incompleta va solo en Incompletas)", async () => {
  const { ctx, page } = await nuevaPagina();
  await abrir(page);
  await irTaller(page);
  const cifra = async (etiqueta) => Number(await page.locator("#resumen-dia .rd", { hasText: etiqueta }).locator("b").textContent());
  const [ent, inc] = [await cifra("Entregadas"), await cifra("Incompletas")];
  assert.ok(ent >= 1 && inc >= 1, "los datos de ejemplo tienen una entregada completa y una incompleta");
  await page.click('#filtros-dia [data-f="ent"]');
  assert.equal(await page.locator("#taller-cuerpo .t-fila[data-ajena]").count(), ent, "el filtro Entregadas lista lo que dice la cifra");
  assert.equal(await page.locator('#taller-cuerpo .t-fila[data-v="inc"]').count(), 0, "las incompletas no se cuelan en Entregadas");
  await page.click('#filtros-dia [data-f="inc"]');
  assert.equal(await page.locator("#taller-cuerpo .t-fila[data-ajena]").count(), inc);
  await ctx.close();
});

await prueba("el día: mientras llegan los estudiantes dice que está cargando (no «0» ni «No hay estudiantes»), y sin señal lo dice", async () => {
  const { ctx, page } = await nuevaPagina();
  await abrir(page);
  await page.route("**/rest/v1/perfiles**", async r => { await new Promise(f => setTimeout(f, 1800)); await r.fallback(); });
  await page.click('[data-nav="instructor"]:visible');
  await page.waitForSelector("#p-gente");
  await page.waitForTimeout(500);
  const cargando = (await page.locator("#taller-cuerpo").textContent()).trim();
  assert.match(cargando, /Cargando el taller/);
  assert.doesNotMatch(cargando, /No hay estudiantes/);
  const mosaico = (await page.locator("#resumen-dia .rd b").allTextContents()).map(t => t.trim());
  assert.deepEqual(mosaico, ["—", "—", "—", "—"], "sin datos todavía, las cifras no dicen 0");
  await page.waitForSelector(".t-fila", { timeout: 6000 });
  assert.match(await page.locator("#resumen-dia").textContent(), /\d/);
  assert.doesNotMatch(await page.locator("#taller-cuerpo").textContent(), /Cargando el taller/);
  // sin conexión: el aviso no dice que no hay estudiantes
  await ctx.setOffline(true);
  await page.click("#ta-refrescar");
  await page.waitForTimeout(400);
  const sinRed = await page.locator("#taller-cuerpo").textContent();
  assert.match(sinRed, /Sin conexión/);
  assert.doesNotMatch(sinRed, /No hay estudiantes/);
  await ctx.close();
});

await prueba("el día: movimiento reducido quita el recorrido de las filas y deja un fundido", async () => {
  const { ctx, page } = await nuevaPagina({ reducedMotion: "reduce" });
  await abrir(page);
  await page.click('[data-nav="instructor"]:visible');
  await page.waitForSelector(".t-fila");
  const anim = await page.evaluate(() => { const f = document.querySelector("#taller-cuerpo.entra .t-fila"); return f ? [getComputedStyle(f).animationName, getComputedStyle(f.querySelector(".t-av i") || f).animationName] : null; });
  if (anim) { assert.equal(anim[0], "aparece-rapido"); assert.notEqual(anim[1], "barra-in"); }
  assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector(".t-fila")).transform), "none");
  await ctx.close();
});

await prueba("el día: las filas son cuadradas y el extremo de la barra está cortado a 30 grados", async () => {
  const { ctx, page } = await nuevaPagina();
  await abrir(page);
  await irTaller(page);
  const r = await page.evaluate(() => {
    const f = document.querySelector(".t-fila"), i = document.querySelector(".t-av i");
    return { radio: getComputedStyle(f).borderRadius, clip: getComputedStyle(i).clipPath, trans: getComputedStyle(f).transitionProperty };
  });
  assert.equal(r.radio, "0px");
  assert.match(r.clip, /polygon/);
  assert.doesNotMatch(r.trans, /\ball\b/);
  await ctx.close();
});

/* ---------------- 3. informes ---------------- */
await prueba("informes: por estudiante con gráfica y nota media; por grupo; por salón", async () => {
  const { ctx, page, errores } = await nuevaPagina();
  await abrir(page);
  await irTaller(page, "informes");
  assert.ok(await page.locator("#cuerpo-informe .gt .gt-f").count() >= 3, "falta la gráfica de trabajo");
  assert.match(await page.locator("#cuerpo-informe .gt").textContent(), /Nota media de los calificados/);
  assert.match(await page.locator("#cuerpo-informe table").textContent(), /Nota media/);
  assert.ok(await page.locator('#cuerpo-informe .gt-f[data-cero]').count() >= 1, "el cero también lleva su base");
  // las hojas entregadas a medias quedan fuera, igual que en Por grupo y Por salón (con el mismo aviso)
  assert.match(await page.locator("#cuerpo-informe .aviso-inc").textContent(), /incompleta no está incluida/);
  const sumaHojas = async col => (await page.locator("#cuerpo-informe table tbody tr").evaluateAll((filas, c) => filas.map(f => Number(f.children[c].textContent.replace(/\D+/g, "")) || 0), col)).reduce((a, b) => a + b, 0);
  const hojasEstudiante = await sumaHojas(1);
  assert.ok(await page.locator('#cuerpo-informe table tbody .estado[data-v="inc"]').count() >= 1, "la columna Sin culminar sigue contando las que quedaron fuera");
  await page.click('[data-informe="grupo"]');
  assert.equal(await sumaHojas(2), hojasEstudiante, "Por estudiante y Por grupo cuentan las mismas hojas");
  assert.match(await page.locator("#cuerpo-informe").textContent(), /TESI 2/);
  await page.click('[data-informe="salon"]');
  assert.match(await page.locator("#cuerpo-informe").textContent(), /Salón 204/);
  assert.deepEqual(errores, []);
  await ctx.close();
});

await prueba("informes: Incompletos agrupa por estudiante con el círculo discontinuo y baja el CSV", async () => {
  const { ctx, page } = await nuevaPagina();
  await abrir(page);
  await irTaller(page, "informes");
  await page.click('[data-informe="incompletos"]');
  await page.waitForSelector(".grupo-falta");
  assert.ok(await page.locator('.grupo-falta tr[data-v="inc"] .estado[data-v="inc"]').count() >= 1);
  console.log("   grupos:", (await page.locator(".grupo-falta h3").allTextContents()).join(" | "));
  assert.match(await page.locator(".grupo-falta").first().textContent(), /Luis|Ana|Profe|Guille/);
  assert.equal(await page.locator("#cuerpo-informe .exclama").count(), 0);
  const [dl] = await Promise.all([page.waitForEvent("download"), page.click("#b-csv-inc")]);
  assert.equal(dl.suggestedFilename(), "equipos-incompletos.csv");
  const txt = await (await import("node:fs/promises")).readFile(await dl.path(), "utf8");
  assert.ok(txt.startsWith("﻿estudiante,grupo,serial"), "el CSV lleva BOM y encabezado");
  // el botón Ver abre la hoja
  await page.click('.grupo-falta [data-ajena]');
  await page.waitForSelector('main[data-vista="reporte"]');
  await ctx.close();
});

await prueba("informes: Todas las hojas filtra por texto y dice cuando nada coincide", async () => {
  const { ctx, page } = await nuevaPagina();
  await abrir(page);
  await irTaller(page, "informes");
  await page.click('[data-informe="todo"]');
  await page.waitForSelector("#tb tr[data-ajena]");
  const todas = await page.locator("#tb tr[data-ajena]").count();
  assert.ok(todas >= 4);
  await page.fill("#fi-texto", "nxhf");
  assert.equal(await page.locator("#tb tr[data-ajena]").count(), 1);
  await page.fill("#fi-texto", "zzzz");
  assert.match(await page.locator("#tb").textContent(), /Ninguna hoja coincide/);
  await page.fill("#fi-texto", "");
  await page.selectOption("#fi-vered", "no");
  assert.equal(await page.locator('#tb tr[data-ajena] .estado[data-v="no"]').count(), 1);
  await ctx.close();
});

await prueba("tablas: a 768px son tarjetas con etiqueta y no hay scroll lateral", async () => {
  const { ctx, page } = await nuevaPagina({ viewport: { width: 768, height: 900 } });
  await abrir(page);
  await irTaller(page, "informes");
  for (const k of ["estudiante", "grupo", "salon", "incompletos", "todo"]) {
    await page.click(`[data-informe="${k}"]`);
    await page.waitForSelector("#cuerpo-informe table");
    const t = await page.evaluate(() => { const tb = document.querySelector("#cuerpo-informe table"), env = tb.closest(".tabla-env");
      return { disp: getComputedStyle(tb.querySelector("thead")).display, scroll: env.scrollWidth > env.clientWidth + 1, etiquetas: [...tb.querySelectorAll("td[data-l]")].slice(0, 3).map(td => getComputedStyle(td, "::before").content) }; });
    assert.equal(t.disp, "none", `${k}: el encabezado de la tabla debe esconderse en tarjetas`);
    assert.equal(t.scroll, false, `${k}: scroll lateral dentro de la tabla`);
    assert.ok(t.etiquetas.every(c => /: "$/.test(c)), `${k}: faltan etiquetas data-l`);
  }
  await page.click("#p-gente");
  await page.waitForSelector("#f-nuevo-est");
  assert.equal(await page.evaluate(() => { const env = document.querySelector("#cuerpo-gente .tabla-env"); return env.scrollWidth > env.clientWidth + 1; }), false);
  await ctx.close();
});

/* ---------------- 4. inventario y revisar ---------------- */
await prueba("inventario: lista, marca lo incompleto y baja el CSV", async () => {
  const { ctx, page } = await nuevaPagina();
  await abrir(page);
  await irTaller(page, "inventario");
  assert.match(await page.locator("#cuerpo-inventario").textContent(), /ABC1234/);
  assert.ok(await page.locator('#cuerpo-inventario tr[data-v="inc"]').count() >= 1, "XYZ99 está incompleto");
  const [dl] = await Promise.all([page.waitForEvent("download"), page.click("#b-csv")]);
  assert.equal(dl.suggestedFilename(), "inventario-taller.csv");
  await ctx.close();
});

await prueba("revisar: duplicados con 'Se queda', Unificar pide confirmación y Ver abre la hoja", async () => {
  const { ctx, page } = await nuevaPagina();
  await abrir(page);
  await irTaller(page, "revisar");
  assert.match(await page.locator("#cuerpo-revisar").textContent(), /Una misma máquina, 2 veces/);
  assert.equal(await page.locator(".dup-lista li.gana .chip").first().textContent(), "Se queda");
  let mensaje = "";
  page.once("dialog", d => { mensaje = d.message(); d.dismiss(); });
  await page.click("[data-unir-eq]");
  assert.match(mensaje, /Se queda ".*" y desaparecen/);
  assert.equal(await page.locator("#cuerpo-revisar .pill").count(), 0);
  await page.click('#cuerpo-revisar [data-ajena]');
  await page.waitForSelector('main[data-vista="reporte"]');
  await ctx.close();
});

/* ---------------- 5. gente ---------------- */
await prueba("gente (superusuario): crear estudiante, roles, nueva clave, borrar y el recinto de cada persona", async () => {
  const { ctx, page, errores } = await nuevaPagina();
  await abrir(page);
  await irTaller(page, "gente");
  const cuerpo = page.locator("#cuerpo-gente");
  assert.match(await cuerpo.textContent(), /Pide ser instructor/);
  assert.equal(await page.locator('#cuerpo-gente .chip:has(svg use[href="#g-info"])').count(), 1, "el aviso 'Pide ser instructor' usa el glifo de información, no uno de veredicto");
  assert.equal(await page.locator("#cuerpo-gente [data-g-clave]").count() >= 4, true);
  assert.equal(await page.locator('[data-g-rol][data-a="instructor"]').count() >= 3, true, "el superusuario ve Hacer instructor");
  assert.equal(await page.locator('[data-g-rol][data-a="estudiante"]').count(), 1, "y Quitar instructor para el otro instructor");
  assert.equal(await page.locator('[data-g-recinto]').count() >= 6, true, "cada persona lleva su selector de recinto");
  // el recinto de Luis (sin elegir) pasa a Manatí y se escribe en perfiles
  const antes = escrituras.length;
  await page.selectOption('[data-g-recinto="e2"]', "manati");
  // la confirmación es el aviso flotante (#toast, aria-live), que está a la vista aunque la tabla sea larga
  await page.waitForFunction(() => /Manatí/.test(document.querySelector("#toast")?.textContent || ""));
  const w = escrituras.slice(antes).find(x => x.tabla === "perfiles" && "recinto" in x.cambios);
  assert.ok(w, "falta el PATCH a perfiles");
  assert.equal(w.cambios.recinto, "manati");
  assert.match(w.filtro, /id=eq\.e2/);
  assert.equal(await page.locator("#toast.on").count(), 1);
  // quitar el recinto manda "" (la columna es text not null default ''; null la rompería)
  await page.selectOption('[data-g-recinto="e2"]', "");
  await page.waitForFunction(() => /sin recinto/.test(document.querySelector("#toast")?.textContent || ""));
  assert.equal(escrituras.at(-1).cambios.recinto, "");
  assert.equal(await page.locator("#toast.on").count(), 1, "quitar el recinto tiene que salir bien");
  assert.doesNotMatch(await page.locator("#aviso").textContent(), /Falta la columna/);
  assert.equal(await page.locator('[data-g-recinto="e2"]').inputValue(), "");
  // crear estudiante
  const dialogos = [];
  page.on("dialog", d => { dialogos.push(d.message()); d.accept(d.type() === "prompt" ? d.defaultValue() : undefined); });
  await page.fill("#g-usuario", "nuevo1");
  await page.fill("#g-nombre", "Nuevo Uno");
  await page.click('#f-nuevo-est button[type="submit"]');
  await page.waitForFunction(() => /Estudiante agregado/.test(document.querySelector("#aviso")?.textContent || ""));
  assert.match(dialogos.join("\n"), /Cuenta creada/);
  // nueva clave y borrar piden confirmación
  const dialogo = async (clic, patron) => { const n = dialogos.length; await page.click(clic); await page.waitForFunction(() => true); for (let i = 0; i < 40 && !dialogos.slice(n).some(m => patron.test(m)); i++) await page.waitForTimeout(50); assert.ok(dialogos.slice(n).some(m => patron.test(m)), "no salió " + patron + " en " + JSON.stringify(dialogos.slice(n))); };
  await dialogo('[data-g-clave="e2"]', /Clave de Luis/);
  await dialogo('[data-g-borrar="e2"]', /Se borra la cuenta de Luis/);
  await dialogo('[data-g-rol="e2"]', /Nombrar instructor a Luis/);
  assert.deepEqual(errores, []);
  await ctx.close();
});

await prueba("gente (instructor sin superusuario): solo gestiona estudiantes", async () => {
  const { ctx, page } = await nuevaPagina();
  await abrir(page, { quien: "prof2" });
  await irTaller(page, "gente");
  assert.equal(await page.locator("[data-g-rol]").count(), 0, "solo el superusuario nombra instructores");
  assert.equal(await page.locator('[data-g-clave="i1"], [data-g-borrar="i1"]').count(), 0, "un instructor no gestiona a otro instructor ni al superusuario");
  assert.equal(await page.locator('[data-g-clave="e1"]').count(), 1);
  assert.equal(await page.locator('[data-g-recinto="e1"]').count(), 1, "el instructor puede cambiar el recinto de sus estudiantes");
  assert.equal(await page.locator('[data-g-recinto="i1"]').count(), 0, "pero no el de otro instructor");
  assert.match(await page.locator("#cuerpo-gente .pista").first().textContent(), /Solo el superusuario nombra instructores/);
  await ctx.close();
});

await prueba("seguridad: un nombre con HTML se muestra como texto en el día, los informes y Gente", async () => {
  const { ctx, page } = await nuevaPagina();
  await abrir(page);
  await irTaller(page);
  assert.match(await page.locator("#taller-cuerpo").textContent(), /<img src=x/);
  for (const p of ["informes", "inventario", "revisar", "gente"]) { await page.click("#p-" + p); await page.waitForTimeout(150); }
  await page.click("#p-informes"); await page.click('[data-informe="incompletos"]'); await page.click('[data-informe="todo"]');
  assert.equal(await page.evaluate(() => window.__xss), undefined, "se ejecutó HTML del nombre");
  assert.equal(await page.locator('img[src="x"]').count(), 0);
  await ctx.close();
});

/* ---------------- 6. el cartel del código QR ---------------- */
await prueba("cartel QR: marca del recinto, QR, aval DEPR; en impresión es negro sobre blanco sin adornos", async () => {
  const { ctx, page, errores } = await nuevaPagina({ viewport: { width: 1100, height: 900 } });
  await abrir(page, { recinto: "manati", modo: "oscuro" });
  await irCodigo(page);
  assert.match(await page.locator(".cartel-url").textContent(), /\?nuevo=1$/);
  assert.equal(await page.locator(".cartel-marca img:visible").count(), 1);
  assert.match(await page.locator(".cartel-marca img:visible").getAttribute("src"), /puma\.webp/);
  assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector(".cartel")).backgroundColor), "rgb(255, 255, 255)", "el cartel es blanco también en modo oscuro");
  // cambiar de recinto con el cartel abierto cambia la marca del cartel
  await page.evaluate(() => document.documentElement.setAttribute("data-recinto", "sanjuan"));
  assert.match(await page.locator(".cartel-marca img:visible").getAttribute("src"), /tiburon\.webp/);
  await page.emulateMedia({ media: "print" });
  const p = await page.evaluate(() => {
    const c = document.querySelector(".cartel"), cs = getComputedStyle(c);
    return { fondo: cs.backgroundColor, color: getComputedStyle(c.querySelector("h2")).color, hero: getComputedStyle(document.querySelector(".hero")).display,
      banda: getComputedStyle(c.querySelector(".cartel-banda")).display, barra: getComputedStyle(document.querySelector(".barra")).display, clip: cs.clipPath };
  });
  assert.equal(p.fondo, "rgb(255, 255, 255)");
  assert.equal(p.color, "rgb(0, 0, 0)");
  assert.equal(p.hero, "none"); assert.equal(p.banda, "none"); assert.equal(p.barra, "none");
  const m = await marcas(page);
  assert.deepEqual(m.mal, []);
  await page.emulateMedia({ media: "screen" });
  assert.deepEqual(errores, []);
  await ctx.close();
});

await terminar();
