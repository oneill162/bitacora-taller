// Pruebas de los arreglos de la ronda de integración (cada defecto crítico o mayor que revisaron tres lectores, más los menores baratos).
//   node pruebas/ui-arreglos.mjs               (Edge o Chrome ya instalados, Supabase de mentira de arnes.mjs)
//   CAPTURAS=1 node pruebas/ui-arreglos.mjs   además guarda capturas en .diseno/arreglos/shots/
import assert from "node:assert/strict";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import * as inf from "../docs/informes.js";

const { nuevaPagina, entrar, prueba, terminar, PERFILES, navegador } = await import("./arnes.mjs");
const { abrirPantalla } = await import("./pantallas.mjs");
const { pixelesDistintos } = await import("./auditoria-marcas.mjs");

const SHOTS = join(import.meta.dirname, "..", ".diseno", "arreglos", "shots");
if (process.env.CAPTURAS) mkdirSync(SHOTS, { recursive: true });
const TEL = { viewport: { width: 390, height: 800 }, isMobile: true, hasTouch: true };
const NAV = k => `[data-nav="${k}"]:visible`;
const cors = { "access-control-allow-origin": "*" };
const fallaFuncion = (page, nombre, cuerpo, captura) => page.route(new RegExp(`/functions/v1/${nombre}`), async r => {
  if (r.request().method() !== "POST") return r.fallback();
  if (captura) captura(r.request().postDataJSON());
  await r.fulfill({ status: 400, contentType: "application/json", headers: cors, body: JSON.stringify(cuerpo) });
});
const enVista = (page, sel) => page.evaluate(s => { const e = document.querySelector(s); if (!e || e.hidden) return false; const r = e.getBoundingClientRect(); return r.height > 0 && r.top >= 0 && r.bottom <= innerHeight; }, sel);

/* ---------------- tablero: respuestas fuera de orden ---------------- */
await prueba("tablero: la respuesta de una fecha vieja que llega tarde no pisa la de la fecha nueva", async () => {
  const { ctx, page, errores } = await nuevaPagina();
  await entrar(page, "prof");
  await page.click(NAV("instructor"));
  await page.waitForSelector(".t-fila");
  await page.route(/\/rest\/v1\/diagnosticos.*fecha=eq\.2026-01-01/, async r => { await new Promise(f => setTimeout(f, 1500)); await r.fallback(); });
  await page.fill("#ta-fecha", "2026-01-01");
  await page.waitForTimeout(200);
  await page.fill("#ta-fecha", "2026-01-02");
  await page.waitForTimeout(2600);                                   // ya llegó la respuesta lenta
  assert.doesNotMatch(await page.locator("#taller-cuerpo").textContent(), /Cargando el taller/);
  assert.equal(await page.inputValue("#ta-fecha"), "2026-01-02");
  assert.ok(await page.locator(".t-fila").count() > 0, "el tablero sigue mostrando a los estudiantes");
  assert.deepEqual(errores, []);
  await ctx.close();
});

/* ---------------- selector de recinto en el teléfono ---------------- */
await prueba("hoja de recinto (teléfono): un toque en su relleno no la cierra, uno en el fondo sí; los aria dicen «diálogo»", async () => {
  const { ctx, page } = await nuevaPagina(TEL);
  await entrar(page, "prof");
  const chip = page.locator(".barra [data-rec-btn]");
  const menuId = await chip.getAttribute("aria-controls");
  await chip.click();
  await page.waitForSelector("dialog#dlg-recinto[open]");
  assert.equal(await chip.getAttribute("aria-haspopup"), "dialog");
  assert.equal(await chip.getAttribute("aria-expanded"), "true");
  assert.equal(await chip.getAttribute("aria-controls"), "dlg-recinto");
  const r = await page.locator("dialog#dlg-recinto").boundingBox();
  await page.mouse.click(r.x + r.width / 2, r.y + 5);                // el relleno de arriba, dentro de la hoja
  await page.mouse.click(r.x + 5, r.y + r.height / 2);               // y el de un lado
  await page.waitForTimeout(150);
  assert.equal(await page.evaluate(() => document.getElementById("dlg-recinto").open), true, "el relleno no cierra la hoja");
  await page.mouse.click(r.x + r.width / 2, Math.max(5, r.y - 60));  // el fondo
  await page.waitForFunction(() => !document.getElementById("dlg-recinto").open);
  assert.equal(await chip.getAttribute("aria-expanded"), "false");
  assert.equal(await chip.getAttribute("aria-haspopup"), "menu");
  assert.equal(await chip.getAttribute("aria-controls"), menuId);
  await ctx.close();
});

/* ---------------- registro ---------------- */
await prueba("registro: el recinto empieza en «Sin elegir» salvo que este equipo ya tenga uno, y se envía tal cual", async () => {
  const { ctx, page } = await nuevaPagina();
  await page.goto((await import("./arnes.mjs")).URL_APP);
  await page.click("#m-crear");
  assert.equal(await page.inputValue("#a-recinto"), "", "sin recinto elegido en el equipo, empieza vacío");
  assert.equal(await page.locator("#a-recinto option").first().textContent(), "Sin elegir");
  let cuerpo;
  await fallaFuncion(page, "registro", { error: "El código de clase no es válido." }, c => { cuerpo = c; });
  await page.fill("#a-usuario", "nuevo1"); await page.fill("#a-clave", "secreta1"); await page.fill("#a-codigo", "0000");
  await page.click("#a-enviar");
  await page.waitForFunction(() => document.querySelector("#aviso")?.textContent);
  assert.equal(cuerpo.recinto, "", "lo que el equipo solo recuerda no pasa al perfil");
  await page.locator("#a-recinto").selectOption("manati");           // elegirlo en la lista mueve toda la bitácora
  await page.waitForFunction(() => document.documentElement.dataset.recinto === "manati", null, { timeout: 3000 });
  await ctx.close();
  const b = await nuevaPagina();
  await b.page.addInitScript(() => { try { localStorage.setItem("bitacora:recinto", "sanjuan"); } catch (_) {} });
  await b.page.goto((await import("./arnes.mjs")).URL_APP);
  await b.page.click("#m-crear");
  assert.equal(await b.page.inputValue("#a-recinto"), "sanjuan", "con un recinto elegido a propósito en el equipo, lo trae");
  await b.ctx.close();
});

await prueba("registro (teléfono): el error aparece a la vista, no 800 px arriba", async () => {
  const { ctx, page } = await nuevaPagina({ ...TEL, viewport: { width: 375, height: 812 } });
  await page.goto((await import("./arnes.mjs")).URL_APP);
  await page.click("#m-crear");
  await fallaFuncion(page, "registro", { error: "El código de clase no es válido." });
  await page.fill("#a-usuario", "nuevo1"); await page.fill("#a-clave", "secreta1"); await page.fill("#a-codigo", "0000");
  await page.locator("#a-enviar").scrollIntoViewIfNeeded();
  await page.click("#a-enviar");
  await page.waitForFunction(() => document.querySelector("#aviso")?.textContent.includes("código de clase"));
  await page.waitForFunction(() => { const r = document.querySelector("#aviso").getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; }, null, { timeout: 4000 });
  // el chequeo local del usuario también
  await page.locator("#a-usuario").scrollIntoViewIfNeeded();
  await page.fill("#a-usuario", "AB");
  await page.locator("#a-enviar").scrollIntoViewIfNeeded();
  await page.click("#a-enviar");
  await page.waitForFunction(() => document.querySelector("#aviso")?.textContent.includes("entre 3 y 32"));
  await page.waitForFunction(() => { const r = document.querySelector("#aviso").getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; }, null, { timeout: 4000 });
  if (process.env.CAPTURAS) await page.screenshot({ path: join(SHOTS, "registro-error-visible-375.png") });
  await ctx.close();
});

/* ---------------- Gente ---------------- */
await prueba("Gente (teléfono): el error de «Agregar estudiante» sale a la vista y leído (role=status); trae el recinto", async () => {
  const { ctx, page } = await nuevaPagina({ ...TEL, viewport: { width: 375, height: 812 } });
  await entrar(page, "prof");
  await page.click(NAV("instructor")); await page.waitForSelector("#p-gente");
  await page.click("#p-gente"); await page.waitForSelector("#f-nuevo-est");
  assert.equal(await page.inputValue("#g-recinto"), "sanjuan", "por defecto el recinto del instructor");
  assert.equal(await page.getAttribute("#aviso", "role"), "status");
  let cuerpo;
  await fallaFuncion(page, "gestion", { error: "Ese usuario ya existe." }, c => { cuerpo = c; });
  await page.fill("#g-usuario", "ana"); await page.locator("#g-recinto").selectOption("manati");
  await page.click('#f-nuevo-est button[type="submit"]');
  await page.waitForFunction(() => document.querySelector("#aviso")?.textContent.includes("ya existe"));
  await page.waitForFunction(() => { const r = document.querySelector("#aviso").getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; }, null, { timeout: 4000 });
  assert.equal(cuerpo.recinto, "manati");
  await ctx.close();
});

await prueba("Gente: el instructor que se pone «Sin elegir» también lo guarda en la copia del equipo", async () => {
  const { ctx, page } = await nuevaPagina();
  await entrar(page, "prof");
  await page.click(NAV("instructor")); await page.waitForSelector("#p-gente");
  await page.click("#p-gente"); await page.waitForSelector('[data-g-recinto="i1"]');
  await page.locator('[data-g-recinto="i1"]').selectOption("");
  await page.waitForFunction(async () => (await (await import("./local.js")).leerMeta("perfil"))?.recinto === "", null, { timeout: 4000 });
  await ctx.close();
});

/* ---------------- Mis hojas del instructor ---------------- */
await prueba("Mis hojas: un instructor ve solo las suyas (no las de los estudiantes) y sin insignia roja falsa", async () => {
  const { ctx, page } = await nuevaPagina();
  await entrar(page, "prof");
  await page.click(NAV("panel")); await page.waitForSelector("#h-lista");
  assert.equal(await page.locator(".tarjeta").count(), 0, "las hojas de Ana y Luis no son del instructor");
  assert.match(await page.locator("#h-lista").textContent(), /bitácora está vacía/);
  assert.equal(await page.locator(".nav-p .insignia, .nav-baja .insignia").count(), 0, "sin insignia de incompletas");
  await ctx.close();
});

/* ---------------- informe por estudiante ---------------- */
await prueba("informe por estudiante: un borrador con datos sin llenar no cuenta como «sin culminar»", async () => {
  const gente = [{ id: "e3", nombre: "Guille", usuario: "guille", grupo: "G" }];
  const borrador = { id: "b1", autor_id: "e3", equipo_id: "q9", estado: "borrador", veredicto: "", conteo: { ok: 3, obs: 0, falla: 0, na: 0, sin: 34 }, sistema: "", hallazgos: "", orden: "DX-9" };
  const entregada = { ...borrador, id: "b2", estado: "entregado" };
  assert.equal(inf.porEstudiante(gente, [borrador], 37, {})[0].incompletas, 0);
  assert.equal(inf.porEstudiante(gente, [entregada], 37, {})[0].incompletas, 1);
});

/* ---------------- editor ---------------- */
await prueba("editor: «Qué falta» sigue el serial mientras se escribe, sin esperar a que el campo pierda el foco", async () => {
  const { ctx, page } = await nuevaPagina();
  await entrar(page, "ana");
  await page.click("#d-nuevo"); await page.waitForSelector("[data-punto]");
  assert.match(await page.locator("#r-falta-l").textContent(), /serial/);
  await page.locator("#e-serial").pressSequentially("ABC12");
  assert.doesNotMatch(await page.locator("#r-falta-l").textContent(), /serial/);
  await ctx.close();
});

/* ---------------- dashboard sin :has() ---------------- */
await prueba("dashboard: sin soporte de :has() las cifras no revientan (WebView viejo)", async () => {
  const { ctx, page, errores } = await nuevaPagina();
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => false });   // para que corra el conteo animado
    const q = Element.prototype.querySelectorAll;
    Element.prototype.querySelectorAll = function (s) { if (/:has\(/.test(s)) throw new SyntaxError("sin :has"); return q.call(this, s); };
  });
  await entrar(page, "prof");
  await page.waitForSelector("[data-cuenta]");
  await page.waitForTimeout(1500);
  assert.deepEqual(errores, []);
  const esperado = await page.evaluate(() => [...document.querySelectorAll("[data-cuenta]")].every(n => n.textContent.trim() === n.dataset.cuenta || n.textContent.trim() === "0"));
  assert.ok(esperado);
  await ctx.close();
});

/* ---------------- impresión fuera del reporte ---------------- */
await prueba("impresión: las gráficas que aún no entraron en pantalla salen llenas, no vacías", async () => {
  const { ctx, page } = await nuevaPagina({ viewport: { width: 1280, height: 600 } });
  await entrar(page, "prof");
  await page.waitForSelector(".barra-g, .col .cuerpo, .dona-aro .anillo", { state: "attached" });
  await page.emulateMedia({ media: "print" });
  const mal = await page.evaluate(() => [...document.querySelectorAll(".barra-g, .col .cuerpo, .dona-aro .anillo")]
    .map(e => [e.className, getComputedStyle(e).transform, getComputedStyle(e).opacity]).filter(([, t, o]) => t !== "none" || o !== "1"));
  assert.deepEqual(mal, []);
  await ctx.close();
});

/* ---------------- identidad por recinto ---------------- */
await prueba("lema por recinto: el héroe de inicio y de Mis hojas lo dice y cambia con el recinto", async () => {
  const { ctx, page } = await nuevaPagina();
  await abrirPantalla(page, "inicio", { recinto: "sanjuan" });
  assert.equal((await page.locator(".hero .hero-lema").first().textContent()).trim(), "Revisa a fondo.");
  await page.evaluate(async () => (await import("./campus.js")).aplicarRecinto("manati"));
  assert.equal((await page.locator(".hero .hero-lema").first().textContent()).trim(), "Revisa con garra.");
  await page.click(NAV("panel")); await page.waitForSelector("#h-lista");
  assert.equal((await page.locator(".hero .hero-lema").first().textContent()).trim(), "Revisa con garra.");
  await ctx.close();
});

await prueba("entrada: la ilustración del recinto se ve (escritorio y teléfono) y la leyenda «Elige tu recinto» queda dentro del campo", async () => {
  for (const [ancho, opc] of [[1280, { viewport: { width: 1280, height: 900 } }], [390, TEL]]) for (const recinto of ["sanjuan", "manati", "itpr"]) {
    const { ctx, page } = await nuevaPagina(opc);
    await page.addInitScript(r => { try { localStorage.setItem("bitacora:recinto", r); localStorage.setItem("bitacora:modo", "claro"); } catch (_) {} }, recinto);
    await page.goto((await import("./arnes.mjs")).URL_APP);
    await page.waitForSelector("#f-acceso");
    await page.waitForTimeout(1300);
    const r = await page.evaluate(() => {
      const ilu = [...document.querySelectorAll(".e-hero .ilu")].find(e => getComputedStyle(e).display !== "none");
      const b = ilu?.getBoundingClientRect(), hero = document.querySelector(".e-hero").getBoundingClientRect();
      const fs = document.querySelector(".entrada-cuerpo .elegir").getBoundingClientRect(), lg = document.querySelector(".elegir legend").getBoundingClientRect();
      return { w: b?.width ?? 0, h: b?.height ?? 0, op: ilu ? +getComputedStyle(ilu).opacity : 0, dentro: b ? b.right <= hero.right + 1 && b.bottom <= hero.bottom + 1 : false, legendaDentro: lg.top >= fs.top - .5 };
    });
    assert.ok(r.w > 60 && r.h > 25 && r.op === 1, `${recinto}/${ancho}: ilustración ${JSON.stringify(r)}`);
    assert.ok(r.dentro, `${recinto}/${ancho}: la ilustración no se sale del héroe`);
    assert.ok(r.legendaDentro, `${recinto}/${ancho}: la leyenda cae dentro del campo`);
    if (process.env.CAPTURAS) { await page.screenshot({ path: join(SHOTS, `entrada-${recinto}-claro-${ancho}.png`), fullPage: true }); }
    await ctx.close();
  }
});

await prueba("héroe en el teléfono: la ilustración se ve por encima de la pendiente de la placa, no escondida debajo", async () => {
  for (const recinto of ["sanjuan", "manati", "itpr"]) {
    const { ctx, page } = await nuevaPagina(TEL);
    await abrirPantalla(page, "inicio", { recinto });
    await page.waitForTimeout(1300);
    const hero = page.locator(".hero:not(.sin-placa-tel)").first();
    const r = await page.evaluate(() => {
      const hero = document.querySelector(".hero:not(.sin-placa-tel)"), placa = hero.querySelector(".placa-wrap").getBoundingClientRect();
      const ilu = [...hero.querySelectorAll(".ilu")].find(e => getComputedStyle(e).display !== "none").getBoundingClientRect();
      return { iluAlto: ilu.height, placaAlto: placa.height };
    });
    assert.ok(r.iluAlto > r.placaAlto, `${recinto}: más alta que la placa para asomar por encima ${JSON.stringify(r)}`);
    const con = await hero.screenshot();
    await page.addStyleTag({ content: ".fondo-ilu{display:none!important}" });
    const sin = await hero.screenshot();
    const n = await pixelesDistintos(page, con, sin);
    assert.ok(n > 3000, `${recinto}: la ilustración cambia ${n} píxeles visibles del héroe`);
    if (process.env.CAPTURAS) await page.screenshot({ path: join(SHOTS, `inicio-${recinto}-claro-390.png`) });
    await ctx.close();
  }
});

await prueba("navegación de abajo (teléfono): la pestaña activa y «Nuevo» no son el mismo bloque de color", async () => {
  const { ctx, page } = await nuevaPagina(TEL);
  await abrirPantalla(page, "inicio-estudiante", { recinto: "sanjuan" });
  const c = await page.evaluate(() => {
    const fondo = s => getComputedStyle(document.querySelector(s), "::before").backgroundColor;
    return { activa: fondo('.nav-baja a[aria-current="page"]'), nuevo: fondo(".nav-baja .nav-nuevo") };
  });
  assert.notEqual(c.activa, c.nuevo);
  await ctx.close();
});

await prueba("informes (teléfono): «Última» sigue en la tarjeta y el nombre de la gráfica se parte en vez de cortarse", async () => {
  const { ctx, page } = await nuevaPagina({ ...TEL, viewport: { width: 375, height: 812 } });
  await entrar(page, "prof");
  await page.click(NAV("instructor")); await page.waitForSelector("#p-gente");
  await page.click("#p-informes"); await page.click('[data-informe="estudiante"]');
  await page.waitForSelector("table.apila td[data-l]");
  const r = await page.evaluate(() => ({
    ultima: getComputedStyle(document.querySelector('table.apila td[data-l="Última"]')).display,
    nombre: getComputedStyle(document.querySelector(".gt-n")).whiteSpace }));
  assert.notEqual(r.ultima, "none");
  assert.equal(r.nombre, "normal");
  await ctx.close();
});

/* ---------------- marcas oficiales: nunca semitransparentes ni cruzadas ---------------- */
await prueba("marcas: la placa nunca se desvanece, ni en la entrada del héroe ni en la llegada tras cambiar de recinto", async () => {
  for (const ancho of [390, 1280]) for (const recinto of ["itpr", "sanjuan", "manati"]) for (const pantalla of ["entrada", "inicio"]) {
    const { ctx, page } = await nuevaPagina({ viewport: { width: ancho, height: 800 }, ...(ancho < 500 ? { isMobile: true, hasTouch: true } : {}) });
    await abrirPantalla(page, pantalla, { recinto });
    await page.waitForTimeout(1200);
    const r = await page.evaluate(async () => {
      const mal = [];
      const revisar = (donde) => {
        for (const wrap of document.querySelectorAll(".placa-wrap")) {
          if (getComputedStyle(wrap).display === "none") continue;
          for (let e = wrap; e && e !== document.body; e = e.parentElement) {
            if (e.matches(".hero, .e-izq, .e-hero, main, #app")) break;
            const o = +getComputedStyle(e).opacity;
            if (o < 1) mal.push(`${donde}: ${e.className || e.tagName} opacity ${o.toFixed(2)}`);
          }
        }
      };
      // 1. la entrada del héroe: se vuelve a disparar y se mira cuadro a cuadro
      const cont = document.querySelectorAll(".hero, .e-izq");
      cont.forEach(c => c.classList.remove("visto-ilu")); void document.body.offsetWidth;
      cont.forEach(c => c.classList.add("visto-ilu"));
      for (let i = 0; i < 70; i++) { await new Promise(f => requestAnimationFrame(f)); revisar("entrada " + i); }
      // 2. la llegada del escudo: nada que anime opacidad y, congelada, opaca en varios puntos
      const root = document.documentElement;
      root.classList.remove("llega"); void root.offsetWidth; root.classList.add("llega");
      for (const a of document.getAnimations().filter(a => /^llega-/.test(a.animationName || ""))) {
        if (a.effect.getKeyframes().some(k => "opacity" in k)) mal.push(`${a.animationName} anima opacity`);
        const dur = a.effect.getComputedTiming().duration;
        for (const p of [0, .1, .2, .35, .6, 1]) { a.pause(); a.currentTime = p * dur; await new Promise(f => requestAnimationFrame(f)); revisar(`${a.animationName} ${p * 100}%`); }
        a.cancel();
      }
      root.classList.remove("llega");
      return mal;
    });
    assert.deepEqual(r, [], `${pantalla}/${recinto}/${ancho}`);
    await ctx.close();
  }
});

await prueba("cambio de recinto: las marcas salen de la foto de la página (nombre de vista) mientras dura, y lo sueltan al terminar", async () => {
  for (const [opc, destino] of [[{ viewport: { width: 1280, height: 800 } }, "sanjuan"], [TEL, "manati"]]) {
    const { ctx, page } = await nuevaPagina(opc);
    await abrirPantalla(page, "inicio", { recinto: "itpr" });
    await page.waitForTimeout(1200);
    await page.evaluate(async d => {
      window.__vt = { nombres: [], animaciones: new Set() };
      const { cambiarRecinto } = await import("./campus.js");
      cambiarRecinto(d, { x: innerWidth / 2, y: innerHeight / 2 });
      for (let i = 0; i < 20; i++) {
        await new Promise(f => requestAnimationFrame(f));
        document.querySelectorAll(".placa-wrap, .sello, .placas-pie, .f-placa").forEach(e => { if (e.style.viewTransitionName) window.__vt.nombres.push(e.className); });
        document.getAnimations().forEach(a => { const p = a.effect?.pseudoElement; if (p && /view-transition-group\(marca-/.test(p)) window.__vt.animaciones.add(p); });
      }
    }, destino);
    const vt = await page.evaluate(() => ({ ...window.__vt, animaciones: [...window.__vt.animaciones] }));
    assert.ok(vt.nombres.some(n => /placa-wrap/.test(n)), "la placa del héroe lleva nombre de vista");
    assert.ok(vt.nombres.some(n => /sello/.test(n)), "el sello de la barra también");
    assert.ok(vt.animaciones.length > 0, "las marcas tienen su propia capa animada");
    await page.waitForTimeout(900);
    const quedan = await page.evaluate(() => [...document.querySelectorAll("[style*=view-transition-name]")].length);
    assert.equal(quedan, 0, "al terminar nadie conserva el nombre de vista");
    assert.equal(await page.evaluate(() => document.documentElement.dataset.recinto), destino);
    await ctx.close();
  }
});

await terminar();
