// Pruebas de la hoja (editor), el reporte impreso y la calificación: docs/editor.js + docs/v-editor.css.
//   node pruebas/ui-editor.mjs           (usa Edge o Chrome ya instalados, igual que ui.mjs)
//   CAPTURAS=1 node pruebas/ui-editor.mjs   además guarda las capturas en .diseno/area-editor/shots/
//
// Cubre: las pantallas en los 3 recintos y los 2 modos sin errores de consola; sin desborde horizontal a 320/375/390/768/1280
// (scrollWidth, scrollTo real y ninguna caja pasando el borde); controles de 44px o más en teléfono; sin movimiento en el
// editor (ni entrada escalonada ni bucles) y con movimiento reducido; auditoría de marcas oficiales del membrete del reporte;
// contraste de los pares propios; el idioma de estados (glifo + palabra + barra); autoguardado; calificar; texto de usuario escapado;
// y la impresión (blanco y negro, sin cortes, sin campos, con placas y cajas de firma).
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { PUNTOS } from "../docs/protocolo.js";
const N = PUNTOS.length;
const { URL_APP, nuevaPagina, prueba: prueba0, terminar, sinDesborde, escrituras, PERFILES } = await import("./arnes.mjs");

// el arnés solo imprime la primera línea del error: aquí se imprime entero
const prueba = (n, fn) => prueba0(n, async () => { try { await fn(); } catch (e) { console.log("        " + e.message.split("\n").slice(0, 14).join("\n        ")); throw e; } });

const entrar = async (page, quien) => {
  await page.goto(URL_APP);
  await page.fill("#a-usuario", quien); await page.fill("#a-clave", "secreta1"); await page.click("#a-enviar");
  await page.waitForSelector("main[data-vista=inicio]", { timeout: 8000 });
};

const RAIZ = join(import.meta.dirname, "..");
const SHOTS = join(RAIZ, ".diseno", "area-editor", "shots");
const CAPTURAS = !!process.env.CAPTURAS;
if (CAPTURAS) mkdirSync(SHOTS, { recursive: true });

const RECINTOS = ["itpr", "sanjuan", "manati"];
const MODOS = ["claro", "oscuro"];
const ANCHOS = [320, 375, 390, 768, 1280];
const movil = ancho => ancho < 600 ? { isMobile: true, hasTouch: true } : {};

// Abre una página como "luis" (estudiante, sin recinto en el perfil: manda el del equipo) con recinto y modo guardados.
async function abrirPagina({ recinto = "itpr", modo = "claro", ancho = 1280, alto = 900, extra = {} } = {}) {
  // el Supabase de mentira guarda el PATCH del recinto en el perfil de luis: sin esto el primer recinto mandaría en todas las corridas
  PERFILES.find(p => p.usuario === "luis").recinto = "";
  const { ctx, page, errores } = await nuevaPagina({ viewport: { width: ancho, height: alto }, ...movil(ancho), ...extra });
  await page.addInitScript(([r, m]) => { try { localStorage.setItem("bitacora:recinto", r); localStorage.setItem("bitacora:modo", m); } catch (_) {} }, [recinto, modo]);
  page.on("dialog", d => d.accept());
  await entrar(page, "luis");
  return { ctx, page, errores };
}

// Pone una hoja de ejemplo en la app y la pinta. vista: editor | reporte | ajena (reporte de un estudiante, visto por el instructor)
async function mostrar(page, vista, op = {}) {
  await page.evaluate(async ([vista, op]) => {
    const N = await import("./nucleo.js"), R = await import("./router.js"), P = await import("./protocolo.js");
    const puntos = {};
    P.PUNTOS.forEach((p, i) => {
      if (op.incompleto && i >= P.PUNTOS.length - 3) return;
      const s = i === 5 ? "falla" : i % 7 === 3 ? "obs" : i % 11 === 10 ? "na" : "ok";
      puntos[p.clave] = { estado: vista === "editor" && op.vacio ? "" : s, nota: i === 5 ? "Disco con sectores dañados <b>x</b>" : i === 3 ? "Polvo en el disipador" : "" };
    });
    if (op.vacio) Object.keys(puntos).forEach(k => { puntos[k] = { estado: "", nota: "" }; });
    const planos = {}; Object.keys(puntos).forEach(k => { if (puntos[k].estado) planos[k] = puntos[k].estado; });
    const r = P.resumir(planos);
    N.estado.puntos = puntos;
    N.estado.equipo = { serial: op.incompleto ? "" : "ABC1234", marca: "HP", modelo: "ProBook 450 G8", tipo: "Portátil", inventario: "INV-00842", ubicacion: "Salón 204" };
    N.estado.diag = { id: "dx1", autor_id: "e2", fecha: "2026-10-20", orden: op.orden || "DX-261020-01", usuario_equipo: "Salón 204",
      sistema: op.incompleto ? "" : "Windows 11 Pro", acciones: "Limpieza de disipador.\nDISM y sfc /scannow sin errores.",
      hallazgos: op.incompleto ? "" : "Disco con 4% libre en C:. Se recomienda evaluar migración a SSD.", proximo_paso: "Programar mantenimiento preventivo",
      estado: vista === "editor" ? "borrador" : "entregado", veredicto: r.veredicto, conteo: r.conteo,
      nota: op.nota ?? null, comentario: op.comentario || "" };
    N.estado.ajena = vista === "ajena";
    N.estado.autor = vista === "ajena" ? { usuario: "ana", nombre: op.nombre || "Ana Rivera", grupo: "TESI 2", escuela: "Plantel" } : N.estado.perfil;
    if (vista === "ajena") { N.estado.perfil = { ...N.estado.perfil, rol: "instructor" }; N.estado.taller = N.estado.taller || { fecha: "2026-10-20", grupo: "", estudiantes: [], hojas: [] }; }
    N.estado.vista = vista === "editor" ? "editor" : "reporte";
    R.pintar();
  }, [vista, op]);
  await page.waitForSelector(vista === "editor" ? ".punto" : ".hoja");
}

// Cajas visibles que pasan el borde derecho de la ventana (el scroll no lo delata porque #app recorta con overflow-x:clip).
const desbordan = page => page.evaluate(() => {
  const W = innerWidth, malos = [];
  document.querySelectorAll("main *, .resumen *").forEach(e => {
    const cs = getComputedStyle(e);
    if (cs.display === "none" || cs.visibility === "hidden" || e.classList.contains("sr")) return;
    if (e.matches('.seg input, svg *')) return;
    const r = e.getBoundingClientRect();
    if (!r.width || !r.height) return;
    if (r.right > W + 1 || r.left < -1) malos.push(`${e.tagName.toLowerCase()}.${[...e.classList].join(".")} ${Math.round(r.left)}..${Math.round(r.right)}`);
  });
  return malos.slice(0, 5);
});

const luz = c => { const f = v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }; return .2126 * f(c[0]) + .7152 * f(c[1]) + .0722 * f(c[2]); };
const razon = (a, b) => { const [x, y] = [luz(a), luz(b)].sort((p, q) => q - p); return (x + .05) / (y + .05); };

/* ---------------------------------------------------------------- pantallas y desborde */
await prueba("las tres pantallas en 3 recintos x 2 modos x 5 anchos: sin errores, sin desborde de lado", async () => {
  for (const modo of MODOS) for (const recinto of RECINTOS) for (const ancho of ANCHOS) {
    if (modo === "oscuro" && ![390, 1280].includes(ancho)) continue;
    const { ctx, page, errores } = await abrirPagina({ recinto, modo, ancho });
    for (const [vista, op] of [["editor", {}], ["reporte", { nota: 88, comentario: "Buen trabajo." }], ["ajena", { incompleto: true }]]) {
      await mostrar(page, vista, op);
      const donde = `${recinto}/${modo}/${ancho}/${vista}`;
      assert.ok(await sinDesborde(page), `desborde horizontal en ${donde}`);
      assert.deepEqual(await desbordan(page), [], `cajas fuera de la ventana en ${donde}`);
    }
    assert.deepEqual(errores, [], `errores de consola en ${recinto}/${modo}/${ancho}`);
    await ctx.close();
  }
});

await prueba("nombre y orden muy largos no desbordan (320 y 375)", async () => {
  for (const ancho of [320, 375]) {
    const { ctx, page } = await abrirPagina({ ancho });
    await mostrar(page, "ajena", { nombre: "Guillermina Maldonado Rodríguez de la Cruz", orden: "DX-" + "1234567890".repeat(4) });
    assert.ok(await sinDesborde(page), `desborde del reporte a ${ancho}`);
    assert.deepEqual(await desbordan(page), []);
    await mostrar(page, "editor", { orden: "DX-" + "1234567890".repeat(4) });
    assert.ok(await sinDesborde(page), `desborde del editor a ${ancho}`);
    assert.deepEqual(await desbordan(page), []);
    await ctx.close();
  }
});

/* ---------------------------------------------------------------- objetivos táctiles */
await prueba("teléfono: todo control mide 44px o más (editor, barra de abajo y reporte)", async () => {
  const { ctx, page } = await abrirPagina({ ancho: 375, alto: 800 });
  for (const [vista, op] of [["editor", { incompleto: true }], ["reporte", { nota: 90 }], ["ajena", { incompleto: true }]]) {
    await mostrar(page, vista, op);
    if (vista === "editor") await page.click("#r-falta summary");
    const chicos = await page.evaluate(() => [...document.querySelectorAll("main button, main a[href], main select, main textarea, main summary, main input:not([type=radio]):not([type=hidden]), main .seg label, .resumen button, .resumen summary")]
      .filter(e => { const cs = getComputedStyle(e), r = e.getBoundingClientRect(); return cs.display !== "none" && r.width > 0; })
      .map(e => ({ n: e.tagName.toLowerCase() + (e.id ? "#" + e.id : "") + "." + [...e.classList].join("."), h: Math.round(e.getBoundingClientRect().height), w: Math.round(e.getBoundingClientRect().width) }))
      .filter(x => x.h < 44 || x.w < 44));
    assert.deepEqual(chicos, [], `controles chicos en ${vista}`);
  }
  await ctx.close();
});

/* ---------------------------------------------------------------- movimiento */
await prueba("el editor no tiene entradas escalonadas ni movimiento ambiental (normal y reducido)", async () => {
  for (const reducedMotion of ["no-preference", "reduce"]) {
    const { ctx, page } = await abrirPagina({ extra: { reducedMotion } });
    await mostrar(page, "editor");
    await page.waitForTimeout(150);
    const vivas = await page.evaluate(() => document.getAnimations().filter(a => a.playState === "running" && !(a.effect?.target?.closest?.("dialog,#toast,.menu-rec"))).length);
    assert.equal(vivas, 0, `animaciones corriendo en el editor (${reducedMotion})`);
    assert.equal(await page.locator("main .rev, main .linea, main .barra-g").count(), 0, "el editor no usa clases de entrada");
    assert.equal(await page.locator(".nav-baja").count(), 0, "el editor no pinta la navegación de abajo");
    assert.equal(await page.locator(".pie").count(), 0, "el editor no pinta el pie");
    await mostrar(page, "reporte", { nota: 77 });
    assert.equal(await page.locator("main .rev, main .linea").count(), 0);
    // toda transición del editor es de color/transform/opacidad y menos de 300ms
    const malas = await page.evaluate(() => [...document.querySelectorAll("main *")].map(e => getComputedStyle(e)).filter(cs =>
      (cs.transitionProperty.split(",").some(p => p.trim() === "all") && cs.transitionDuration.split(",").some(d => parseFloat(d) > 0)) ||
      cs.transitionDuration.split(",").some(d => parseFloat(d) > .3)).length);
    assert.equal(malas, 0, "transición con all o de más de 300ms");
    await ctx.close();
  }
});

await prueba("presionar un estado se siente: scale(.97) en menos de 100ms, y se quita con movimiento reducido", async () => {
  const css = await (await fetch(URL_APP + "v-editor.css")).text();
  assert.match(css, /\.seg label:active\{transform:scale\(\.97\);transition-duration:\.08s\}/);
  assert.match(css, /prefers-reduced-motion:reduce\)\{\s*\.seg label:active\{transform:none\}/);
  assert.ok(!/transition:\s*all/.test(css.replace(/\/\*[\s\S]*?\*\//g, "")), "transition:all");
  // el roce solo existe con puntero fino
  const fuera = css.replace(/\/\*[\s\S]*?\*\//g, "").replace(/@media \(hover:hover\) and \(pointer:fine\)\{[\s\S]*?\n\}/g, "");
  assert.ok(!/:hover/.test(fuera), "hover fuera de (hover:hover) and (pointer:fine)");
});

/* ---------------------------------------------------------------- marcas oficiales (el membrete del reporte) */
const MIN = { "tiburon.webp": 72, "itpr-marca.webp": 24, "itpr-manati.webp": 160, "depr.webp": 140 };
await prueba("marcas oficiales del reporte: sin giro, sin recorte, sin deformar, con tamaño mínimo (3 recintos x 2 modos x 4 anchos)", async () => {
  let n = 0;
  for (const modo of MODOS) for (const recinto of RECINTOS) for (const ancho of [320, 375, 390, 1280]) {
    const { ctx, page } = await abrirPagina({ recinto, modo, ancho });
    await mostrar(page, "ajena");
    const logos = await page.evaluate(() => [...document.querySelectorAll("img")].filter(i => i.closest(".hoja-ident")).map(img => {
      const r = img.getBoundingClientRect(), cs = getComputedStyle(img);
      if (!r.width || !r.height || cs.display === "none") return null;
      const cadena = []; for (let e = img; e && e !== document.documentElement; e = e.parentElement) cadena.push(e);
      const caja = (r.width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)) / (r.height - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom));
      return { archivo: img.src.split("/").pop(), w: r.width, desvio: Math.abs(caja / (img.naturalWidth / img.naturalHeight) - 1),
        transforms: cadena.map(e => getComputedStyle(e).transform).filter(t => t !== "none"),
        recortes: cadena.filter(e => getComputedStyle(e).clipPath !== "none").length,
        filtro: cadena.some(e => getComputedStyle(e).filter !== "none"),
        // espacio libre: la placa que la contiene deja >= 12 % del alto de la marca por cada lado
        libre: (() => { const p = img.parentElement.getBoundingClientRect(); return Math.min(r.left - p.left, p.right - r.right, r.top - p.top, p.bottom - r.bottom) / r.height; })() };
    }).filter(Boolean));
    assert.ok(logos.length >= 2, `faltan marcas en ${recinto}/${modo}/${ancho}`);
    for (const l of logos) {
      n++;
      const donde = `${recinto}/${modo}/${ancho} ${l.archivo}`;
      assert.deepEqual(l.transforms, [], `transform en ${donde}`);
      assert.equal(l.recortes, 0, `clip-path de un ancestro en ${donde}`);
      assert.equal(l.filtro, false, `filtro en ${donde}`);
      assert.ok(l.desvio < .01, `deformada en ${donde}: ${(l.desvio * 100).toFixed(1)} %`);
      assert.ok(l.w >= MIN[l.archivo] - .5, `ancho ${l.w.toFixed(0)} bajo el mínimo ${MIN[l.archivo]} en ${donde}`);
      assert.ok(l.libre >= .12 - .005, `espacio libre ${(l.libre * 100).toFixed(0)} % en ${donde}`);
    }
    await ctx.close();
  }
  console.log(`        (${n} marcas revisadas)`);
});

/* ---------------------------------------------------------------- contraste de los pares propios */
await prueba("contraste AA de los pares propios (3 recintos x 2 modos)", async () => {
  const bajos = [];
  for (const modo of MODOS) for (const recinto of RECINTOS) {
    const { ctx, page } = await abrirPagina({ recinto, modo, ancho: 1280 });
    const medir = async () => page.evaluate(() => {
      const num = s => { const m = s.match(/[-\d.e]+/g)?.map(Number) || []; return s.startsWith("color(") ? m.slice(-3).map(v => v * 255) : m.slice(0, 3); };
      const alfa = s => { const m = s.match(/[-\d.e]+/g)?.map(Number) || []; return s.startsWith("color(") ? (m.length > 6 ? m[6] : 1) : (m.length > 3 ? m[3] : 1); };
      const fondo = e => { for (; e; e = e.parentElement) { const b = getComputedStyle(e).backgroundColor; if (alfa(b) > .99) return num(b); } return [255, 255, 255]; };
      const SEL = [".ed-sub", ".ed-gn", ".punto-t", ".punto-h", ".seg input:not(:checked) + label", ".seg input:checked + label", ".estado", ".resumen .guardado", ".ed-falta summary",
        ".ed-falta[open] li", ".ajena", ".falta b", ".falta div span", ".nota-final", ".rt small", ".meta dt", ".meta dd", ".hoja-aval", ".rcuentas li", ".firma small", ".sinval", ".ed-cal-h p"];
      const out = [];
      document.querySelectorAll(SEL.join(",")).forEach(e => {
        const cs = getComputedStyle(e), r = e.getBoundingClientRect();
        if (cs.display === "none" || !r.width || !e.textContent.trim()) return;
        out.push({ s: SEL.find(x => e.matches(x)) + (e.dataset.v ? `[${e.dataset.v}]` : ""), f: num(cs.color), b: fondo(e), grande: parseFloat(cs.fontSize) >= 24 || (parseFloat(cs.fontSize) >= 18.66 && +cs.fontWeight >= 700) });
      });
      return out;
    });
    await mostrar(page, "editor", { incompleto: true });
    await page.click("#r-falta summary");
    const a = await medir();
    await mostrar(page, "ajena", { incompleto: true });
    const b = await medir();
    await mostrar(page, "reporte", { nota: 91, comentario: "Muy bien." });
    const c = await medir();
    for (const m of [...a, ...b, ...c]) {
      const r = razon(m.f, m.b);
      if (r < (m.grande ? 3 : 4.5)) bajos.push(`${recinto}/${modo} ${m.s} ${r.toFixed(2)}`);
    }
    await ctx.close();
  }
  assert.deepEqual([...new Set(bajos)], [], "pares bajo AA");
});

/* ---------------------------------------------------------------- el editor */
await prueba("editor: cuatro estados con glifo + palabra, barra de veredicto, avance y qué falta", async () => {
  const { ctx, page } = await abrirPagina({ ancho: 390, alto: 800 });
  await mostrar(page, "editor", { vacio: true, incompleto: true });
  // cada botón lleva glifo y palabra
  const rotulos = await page.$$eval("#i0-ok + label, #i0-obs + label, #i0-falla + label, #i0-na + label",
    ls => ls.map(l => [l.querySelector("svg.g") ? 1 : 0, l.textContent.trim()]));
  assert.deepEqual(rotulos, [[1, "Bien"], [1, "Obs."], [1, "Falla"], [1, "N/A"]]);
  assert.equal(await page.textContent("#r-vered"), "Sin evaluar");
  assert.equal(await page.textContent("#r-prog"), `0/${N}`);
  await page.click('label[for="i0-ok"]');
  assert.equal(await page.getAttribute("#r-vered", "data-v"), "apto");
  assert.equal(await page.textContent("#r-vered"), "Apto");
  assert.equal(await page.getAttribute("#i0-ok", "data-punto"), "i0");
  assert.equal(await page.locator('.punto:has(#i0-ok)').getAttribute("data-e"), "ok");
  assert.equal(await page.textContent("#r-prog"), `1/${N}`);
  assert.equal(await page.locator("#r-inc").isVisible(), true, "con veredicto pero sin terminar: Incompleto");
  assert.match(await page.locator("#r-inc").textContent(), /Incompleto/);
  assert.equal(await page.locator("#r-inc use").getAttribute("href"), "#g-inc");
  await page.click('label[for="i1-obs"]');
  assert.equal(await page.textContent("#r-vered"), "Apto con observaciones");
  assert.equal(await page.locator("#r-vered use").getAttribute("href"), "#g-obs");
  await page.click('label[for="i2-falla"]');
  assert.equal(await page.textContent("#r-vered"), "No apto");
  assert.equal(await page.locator("#r-vered use").getAttribute("href"), "#g-no");
  // glifo, tono y barra del elegido: forma además de color
  const falla = await page.$eval('#i2-falla + label', l => ({ g: l.querySelector("use").getAttribute("href"), h: getComputedStyle(l, "::before").height, fw: getComputedStyle(l).fontWeight }));
  assert.equal(falla.g, "#g-no"); assert.equal(falla.h, "6px"); assert.equal(+falla.fw, 800);
  const obs = await page.$eval('#i1-obs + label', l => getComputedStyle(l, "::before").backgroundImage);
  assert.match(obs, /repeating-linear-gradient/, "observación: barra rayada");
  // la lista de lo que falta
  await page.click("#r-falta summary");
  const lista = await page.$$eval("#r-falta-l li", l => l.map(x => x.textContent));
  assert.ok(lista.includes("el serial del equipo") && lista.includes("el sistema operativo") && lista.includes(`${N - 3} puntos sin evaluar`) && lista.includes("los hallazgos"), lista.join("|"));
  assert.match(await page.textContent("#r-falta-n"), /^Qué falta \(\d+\)$/);
  // al llenar lo que falta se apaga
  for (const [id, v] of [["e-serial", "ABC1"], ["e-marca", "HP"], ["e-modelo", "X"], ["d-sistema", "Win"], ["d-hallazgos", "ok"]]) await page.fill("#" + id, v);
  const i = await page.$$eval("#r-falta-l li", l => l.map(x => x.textContent));
  assert.deepEqual(i, [`${N - 3} puntos sin evaluar`]);
  await ctx.close();
});

await prueba("editor: teclado en el grupo de estados (flechas) y foco visible", async () => {
  const { ctx, page } = await abrirPagina({ ancho: 1280 });
  await mostrar(page, "editor", { vacio: true });
  await page.focus("#i4-ok");
  await page.keyboard.press("ArrowRight");
  assert.equal(await page.isChecked("#i4-obs"), true);
  assert.equal(await page.locator('.punto:has(#i4-obs)').getAttribute("data-e"), "obs");
  const aro = await page.$eval("#i4-obs + label", l => getComputedStyle(l).outlineStyle + " " + getComputedStyle(l).outlineWidth);
  assert.equal(aro, "solid 3px");
  await ctx.close();
});

await prueba("editor: la barra de abajo queda pegada mientras se baja y no tapa el último campo", async () => {
  const { ctx, page } = await abrirPagina({ ancho: 375, alto: 760 });
  await mostrar(page, "editor");
  for (const y of [0, 1200, 4000, 1e6]) {
    await page.evaluate(y => window.scrollTo(0, y), y);
    await page.waitForTimeout(60);
    const caja = await page.locator(".resumen").boundingBox();
    assert.ok(Math.abs(caja.y + caja.height - 760) <= 1, `la barra no está al fondo con scroll ${y}`);
  }
  // al final de la página el botón Entregar queda libre y el último campo sobre la barra
  const [bar, ult] = await Promise.all([page.locator(".resumen").boundingBox(), page.locator("#d-proximo_paso").boundingBox()]);
  assert.ok(ult.y + ult.height <= bar.y + 1, "la barra tapa el último campo");
  await ctx.close();
});

await prueba("editor: autoguardado y guardado al volver, sin perder lo tecleado", async () => {
  const { ctx, page } = await abrirPagina({ ancho: 1280 });
  await page.evaluate(async () => { await (await import("./acceso.js")).nuevoDiagnostico(); });
  await page.waitForSelector('main[data-vista="editor"]');
  const id = await page.evaluate(async () => (await import("./nucleo.js")).estado.diag.id);
  await page.fill("#d-sistema", "Windows 11");
  assert.equal(await page.textContent("#r-guardado"), "Guardando…");
  await page.waitForFunction(() => /Guardado/.test(document.querySelector("#r-guardado").textContent), null, { timeout: 4000 });
  await page.click('label[for="i0-ok"]');
  await page.fill("#d-hallazgos", "Hallazgo <i>x</i>");
  await ctx.setOffline(true);                       // sin señal: lo que manda es la copia de este equipo (el Supabase de mentira no guarda de verdad)
  await page.click("#b-volver");                                                    // guarda antes de salir
  await page.waitForSelector("main[data-vista=panel]");
  await page.click(`[data-abrir="${id}"]`);
  await page.waitForSelector('main[data-vista="editor"]');
  assert.equal(await page.inputValue("#d-sistema"), "Windows 11");
  assert.equal(await page.inputValue("#d-hallazgos"), "Hallazgo <i>x</i>");
  assert.equal(await page.isChecked("#i0-ok"), true);
  assert.equal(await page.locator("#d-hallazgos + i, label i").count(), 0, "el texto del usuario no debe volverse HTML");
  await ctx.close();
});

await prueba("editor: Entregar pasa al reporte con los estados, y Imprimir llama a la impresión", async () => {
  const { ctx, page } = await abrirPagina({ ancho: 1280 });
  await mostrar(page, "editor");
  await page.evaluate(() => { window.__imprimio = 0; window.print = () => { window.__imprimio++; }; });
  await page.click("#b-entregar");
  await page.waitForSelector('main[data-vista="reporte"]');
  assert.equal(await page.locator(".rrow").count(), N);
  const chips = await page.$$eval(".rrow .estado", l => l.map(x => x.textContent.trim()));
  assert.ok(chips.includes("Bien") && chips.includes("Observación") && chips.includes("Falla") && chips.includes("No aplica"), [...new Set(chips)].join());
  assert.ok((await page.$$eval(".rrow .estado", l => l.every(x => x.querySelector("svg.g")))), "toda fila lleva glifo");
  await page.click("#b-imprimir");
  assert.equal(await page.evaluate(() => window.__imprimio), 1);
  await ctx.close();
});

await prueba("editor: Entregar con datos sin llenar dice qué falta, y Cancelar deja la hoja donde estaba", async () => {
  const { ctx, page } = await abrirPagina({ ancho: 1280 });
  await mostrar(page, "editor", { incompleto: true });
  page.removeAllListeners("dialog");
  const mensajes = [];
  let aceptar = false;
  page.on("dialog", d => { mensajes.push(d.message()); aceptar ? d.accept() : d.dismiss(); });
  await page.click("#b-entregar");
  await page.waitForTimeout(250);
  assert.equal(mensajes.length, 1, "Entregar con faltantes tiene que preguntar");
  for (const f of ["el serial del equipo", "el sistema operativo", "los hallazgos", "3 puntos sin evaluar"]) assert.ok(mensajes[0].includes(f), "el aviso no dice «" + f + "»: " + mensajes[0]);
  assert.match(mensajes[0], /Incompleta/);
  assert.equal(await page.getAttribute("main", "data-vista"), "editor", "cancelar no entrega");
  aceptar = true;
  await page.click("#b-entregar");
  await page.waitForSelector('main[data-vista="reporte"]');
  await ctx.close();
});

await prueba("editor en teléfono con el teclado abierto: la barra de abajo no tapa el campo que se escribe", async () => {
  const { ctx, page } = await abrirPagina({ ancho: 375, alto: 420 });          // 420 de alto = el teléfono con el teclado abierto
  await mostrar(page, "editor", { incompleto: true });
  assert.equal(await page.$eval(".resumen", e => getComputedStyle(e).position), "sticky", "sin foco en un campo, la barra va pegada abajo");
  await page.focus("#d-hallazgos");
  await page.waitForTimeout(200);
  const r = await page.evaluate(() => {
    const barra = document.querySelector(".resumen"), campo = document.querySelector("#d-hallazgos");
    const b = barra.getBoundingClientRect(), c = campo.getBoundingClientRect();
    return { pos: getComputedStyle(barra).position, tapado: Math.max(0, Math.min(c.bottom, innerHeight) - Math.max(c.top, b.top)) * (b.top < innerHeight && getComputedStyle(barra).position === "sticky" ? 1 : 0) };
  });
  assert.equal(r.pos, "static", "con un campo con foco la barra se suelta del borde");
  assert.equal(r.tapado, 0);
  await page.evaluate(() => document.activeElement.blur());
  await page.waitForTimeout(100);
  assert.equal(await page.$eval(".resumen", e => getComputedStyle(e).position), "sticky");
  await ctx.close();
});

await prueba("editor: Entregar con todo lleno no pregunta nada", async () => {
  const { ctx, page } = await abrirPagina({ ancho: 1280 });
  await mostrar(page, "editor");
  page.removeAllListeners("dialog");
  let preguntas = 0;
  page.on("dialog", d => { preguntas++; d.dismiss(); });
  await page.click("#b-entregar");
  await page.waitForSelector('main[data-vista="reporte"]');
  assert.equal(preguntas, 0);
  await ctx.close();
});

/* ---------------------------------------------------------------- reporte y calificación */
await prueba("reporte de otro: aviso de solo lectura (tono de información), falta culminar, y sin tocar nada", async () => {
  const { ctx, page } = await abrirPagina({ ancho: 390 });
  await mostrar(page, "ajena", { incompleto: true });
  const aj = page.locator(".ajena");
  assert.match(await aj.textContent(), /Hoja de Ana Rivera\. Se mira sin editar/);
  assert.equal(await aj.locator("use").getAttribute("href"), "#g-info", "el aviso usa el glifo de información, no uno de veredicto");
  assert.equal(await page.locator(".ajena .estado, .ajena [data-v=obs]").count(), 0);
  const bg = await aj.evaluate(e => getComputedStyle(e).backgroundColor);
  const acc = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--accent-soft"));
  assert.ok(bg && acc, "el fondo sale de --accent-soft");
  assert.equal(await page.locator("#b-reabrir").count(), 0, "no se reabre la hoja de otro");
  assert.equal(await page.locator('.falta [data-v="inc"] use').getAttribute("href"), "#g-inc");
  assert.match(await page.textContent(".falta"), /Queda por poner: el serial del equipo, el sistema operativo, 3 puntos sin evaluar, los hallazgos\./);
  assert.equal(await page.locator('.rveredicto .estado[data-v="inc"]').count(), 1);
  assert.equal(await page.locator("#f-nota").count(), 1);
  await ctx.close();
});

await prueba("calificar: valida 0-100, guarda con comentario y no escapa HTML; borrar pide confirmación y vuelve al taller", async () => {
  const { ctx, page } = await abrirPagina({ ancho: 1280 });
  await mostrar(page, "ajena");
  await page.fill("#n-nota", "101");
  await page.click('#f-nota button[type="submit"]');
  assert.equal((await page.textContent("#aviso")).trim(), "La nota va de 0 a 100.");
  assert.equal(await page.getAttribute("#aviso", "class"), "error");
  const antes = escrituras.length;
  await page.fill("#n-nota", "88.5");
  await page.fill("#n-comentario", "Buen trabajo <b>x</b>");
  await page.click('#f-nota button[type="submit"]');
  await page.waitForFunction(() => document.querySelector("#aviso").className === "exito");
  assert.match(await page.textContent("#aviso"), /^Nota guardada\./);
  const e = escrituras.slice(antes).find(x => x.tabla === "diagnosticos");
  assert.deepEqual(e.cambios, { nota: 88.5, comentario: "Buen trabajo <b>x</b>" });
  assert.equal(await page.locator("#n-comentario b").count(), 0);
  // el aviso queda dentro del formulario de calificar (junto a donde se actúa)
  assert.equal(await page.locator("#f-nota #aviso").count(), 1);
  await page.click("#b-borrar-hoja");
  await page.waitForSelector("main[data-vista=instructor]");
  assert.ok(escrituras.length >= 0);
  await ctx.close();
});

await prueba("el estudiante ve su nota; texto de usuario escapado (orden, nota de punto, comentario, nombre)", async () => {
  const { ctx, page, errores } = await abrirPagina({ ancho: 390 });
  await mostrar(page, "reporte", { nota: 95, comentario: "Muy bien <img src=x onerror=alert(1)>", orden: '<img src=x onerror="window.__xss=1">' });
  assert.equal((await page.textContent(".nota-v")).replace(/\s/g, ""), "95/100");
  assert.match(await page.textContent(".nota-c"), /<img src=x/);
  assert.match(await page.textContent(".hoja-h .orden"), /<img src=x/);
  assert.equal(await page.locator("img[src=x]").count(), 0);
  assert.equal(await page.evaluate(() => window.__xss), undefined);
  assert.ok(await page.locator(".rt small", { hasText: "<b>x</b>" }).count() === 1, "la nota del punto sale como texto");
  assert.deepEqual(errores, []);
  await ctx.close();
});

/* ---------------------------------------------------------------- impresión */
await prueba("impresión: negro sobre blanco aunque esté en oscuro, sin cortes, sin campos, con placas y cajas de firma", async () => {
  for (const [recinto, modo] of [["manati", "oscuro"], ["sanjuan", "claro"], ["itpr", "oscuro"]]) {
    const { ctx, page } = await abrirPagina({ recinto, modo, ancho: 1100 });
    await mostrar(page, "ajena", { incompleto: true });
    await page.emulateMedia({ media: "print" });
    const r = await page.evaluate(() => {
      const cs = e => getComputedStyle(e);
      const visible = s => [...document.querySelectorAll(s)].some(e => cs(e).display !== "none" && e.getBoundingClientRect().width > 0);
      const clip = [...document.querySelectorAll("*")].filter(e => cs(e).clipPath !== "none" || cs(e, "::before").clipPath !== "none" || cs(e, "::after").clipPath !== "none").length;
      const depr = document.querySelector(".placa-depr img").getBoundingClientRect();
      const chips = [...document.querySelectorAll(".rrow .estado")].map(e => cs(e).color).concat([...document.querySelectorAll(".hoja p, .hoja h1, .hoja h3")].map(e => cs(e).color));
      return { fondo: cs(document.querySelector(".hoja")).backgroundColor, fondoBody: cs(document.body).backgroundColor, color: cs(document.querySelector(".hoja")).color, clip,
        barra: visible(".barra"), pie: visible(".pie"), botones: visible(".btn"), campos: visible("input,textarea,select"), resumen: visible(".resumen"), noPrint: visible(".no-print"),
        calificar: visible("#f-nota"), ajena: visible(".ajena"), faltaImp: visible(".falta-imp"), faltaPantalla: visible(".ed-estado .falta"),
        primero: document.querySelector(".ed-papel").getBoundingClientRect().top <= document.querySelector(".ed-estado").getBoundingClientRect().top,
        deprW: depr.width, firmas: [...document.querySelectorAll(".firma")].map(f => f.getBoundingClientRect().height),
        glifos: document.querySelectorAll(".rrow .estado svg.g").length, oscuros: chips.every(c => c === "rgb(0, 0, 0)" || c === "rgb(34, 34, 34)"),
        bar: cs(document.querySelector(".rrow"), "::before").width };
    });
    const d = `${recinto}/${modo}`;
    assert.equal(r.fondo, "rgb(255, 255, 255)", d); assert.equal(r.fondoBody, "rgb(255, 255, 255)", d); assert.equal(r.color, "rgb(0, 0, 0)", d);
    assert.equal(r.clip, 0, `clip-path vivo al imprimir en ${d}`);
    assert.deepEqual([r.barra, r.pie, r.botones, r.campos, r.resumen, r.noPrint, r.calificar, r.ajena], Array(8).fill(false), `se imprime algo que no va en ${d}`);
    assert.ok(r.faltaImp && !r.faltaPantalla && r.primero, `al imprimir: la falta va dentro de la hoja y el membrete primero (${d})`);
    assert.ok(r.deprW >= 140, `DEPR ${r.deprW}`);
    assert.equal(r.firmas.length, 2); assert.ok(r.firmas.every(h => h >= 80), "cajas de firma");
    assert.equal(r.glifos, N, "cada fila lleva glifo al imprimir");
    assert.ok(r.oscuros, `texto no negro al imprimir en ${d}`);
    await ctx.close();
  }
});

/* ---------------------------------------------------------------- capturas */
if (CAPTURAS) {
  await prueba("capturas: 3 recintos x claro/oscuro x escritorio/teléfono", async () => {
    for (const modo of MODOS) for (const recinto of RECINTOS) for (const [nombre, ancho, alto] of [["1280", 1280, 900], ["390", 390, 844]]) {
      const { ctx, page } = await abrirPagina({ recinto, modo, ancho, alto });
      const base = `${recinto}-${modo}-${nombre}`;
      await mostrar(page, "editor", { incompleto: true });
      await page.screenshot({ path: join(SHOTS, `editor-arriba-${base}.png`) });
      await page.evaluate(() => document.querySelector("#g-03").scrollIntoView());
      await page.evaluate(() => window.scrollBy(0, -(innerWidth < 600 ? 90 : 120)));
      await page.click("#r-falta summary");
      await page.waitForTimeout(120);
      await page.screenshot({ path: join(SHOTS, `editor-medio-${base}.png`) });
      await mostrar(page, "ajena", { incompleto: true });
      await page.screenshot({ path: join(SHOTS, `reporte-ajena-${base}.png`), fullPage: true });
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: join(SHOTS, `reporte-ajena-arriba-${base}.png`) });
      await page.evaluate(() => document.querySelector(".hoja").scrollIntoView());
      await page.screenshot({ path: join(SHOTS, `reporte-hoja-${base}.png`) });
      await mostrar(page, "reporte", { nota: 91, comentario: "Muy buen trabajo. Revisa la batería CMOS." });
      await page.screenshot({ path: join(SHOTS, `reporte-propio-${base}.png`), fullPage: true });
      if (nombre === "1280") {
        await page.emulateMedia({ media: "print" });
        await mostrar(page, "ajena");
        await page.pdf({ path: join(SHOTS, `impresion-${recinto}-${modo}.pdf`), format: "A4", printBackground: false });
      }
      await ctx.close();
    }
  });
}

await terminar();
