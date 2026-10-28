// Pruebas de la interfaz con Playwright: que el diseño cargue sin errores, que el
// movimiento haga lo que se diseñó (y se apague con "reducir movimiento"), que
// nada se salga de la pantalla en un teléfono, que el recinto y el modo se apliquen,
// se recuerden y se puedan cambiar, y que las vistas de estudiante e instructor abran.
// Supabase es de mentira: el arnés (arnes.mjs) lo intercepta con page.route.
//
//   npm install --no-save --no-package-lock playwright   (una vez, sin tocar el repo)
//   node pruebas/ui.mjs
//
// Usa Edge o Chrome ya instalados (no baja navegadores). Deja capturas en
// pruebas/capturas/ (ignorada por git).
import assert from "node:assert/strict";
import { join } from "node:path";
import { URL_APP, CAP, PERFILES, escrituras, prueba, terminar, nuevaPagina, entrar, sinDesborde } from "./arnes.mjs";
import { PANTALLAS, abrirPantalla } from "./pantallas.mjs";
import { auditarMarcas } from "./auditoria-marcas.mjs";

// La navegación existe dos veces (barra de arriba y de abajo): se usa la que se ve.
const nav = k => `[data-nav="${k}"]:visible`;
const MOVIL = { viewport: { width: 375, height: 760 }, isMobile: true, hasTouch: true };

console.log("Interfaz");

await prueba("la entrada carga sin errores, con el chasis y con su movimiento", async () => {
  const { ctx, page, errores } = await nuevaPagina();
  await page.goto(URL_APP);
  await page.waitForSelector("#f-acceso");
  // la entrada se revela con .rev (opacidad + recorrido); el titular sube por líneas
  assert.ok(await page.locator(".e-form .rev").count() >= 3, "faltan los elementos con entrada");
  assert.ok(await page.locator(".e-h1 .linea > span").count() >= 6, "falta el titular por líneas");
  assert.equal(await page.locator(".barra, .pie, .nav-baja").count(), 0, "la entrada trae su propia cabecera y aval: sin barra ni pie del router");
  assert.equal(await page.evaluate(() => document.documentElement.classList.contains("js")), true);
  assert.equal(await page.$eval("html", h => h.dataset.recinto), "itpr");
  await page.screenshot({ path: join(CAP, "entrada-claro.png") });
  assert.deepEqual(errores, []);
  await ctx.close();
});

await prueba("botones: se mueven al pasar el cursor, se hunden al presionar, no usan transition: all", async () => {
  const { ctx, page } = await nuevaPagina();
  await page.goto(URL_APP);
  const btn = page.locator("#a-enviar");
  await btn.waitFor();
  const prop = await btn.evaluate(el => getComputedStyle(el).transitionProperty);
  assert.ok(!/\ball\b/.test(prop), "transition-property: " + prop);
  await btn.hover();
  await page.waitForTimeout(260);
  assert.match(await btn.evaluate(el => getComputedStyle(el).transform), /matrix\(1, 0, 0, 1, 0, -3\)/);   // ITPR: sube 3 px
  await page.mouse.down();
  await page.waitForTimeout(160);
  assert.match(await btn.evaluate(el => getComputedStyle(el).transform), /matrix\(0\.97/);
  await page.mouse.up();
  await ctx.close();
});

await prueba("reducir movimiento: sin saltos, el fundido se queda", async () => {
  const { ctx, page } = await nuevaPagina({ reducedMotion: "reduce" });
  await page.goto(URL_APP);
  await page.waitForSelector("#f-acceso");
  // sin recorrido: la entrada del formulario es un fundido de 200 ms
  await page.waitForSelector(".e-form .rev.visto");
  const rev = await page.$eval(".e-form .rev.visto", el => { const c = getComputedStyle(el); return { prop: c.transitionProperty, dur: c.transitionDuration, tr: c.transform }; });
  assert.equal(rev.prop, "opacity");
  assert.equal(rev.dur, "0.2s");
  assert.equal(rev.tr, "none");
  const btn = page.locator("#a-enviar");
  await btn.hover(); await page.waitForTimeout(260);
  assert.equal(await btn.evaluate(el => getComputedStyle(el).transform), "none");
  await ctx.close();
});

await prueba("modo oscuro del sistema se ve y no tiene errores", async () => {
  const { ctx, page, errores } = await nuevaPagina({ colorScheme: "dark" });
  await page.goto(URL_APP);
  await page.waitForSelector("#f-acceso");
  await page.waitForTimeout(450);
  assert.equal(await page.$eval("body", b => getComputedStyle(b).backgroundColor), "rgb(18, 19, 20)");   // --paper oscuro de ITPR
  await page.screenshot({ path: join(CAP, "entrada-oscuro.png") });
  assert.deepEqual(errores, []);
  await ctx.close();
});

await prueba("teléfono (375px): nada se sale de la pantalla en entrada ni en registro", async () => {
  const { ctx, page } = await nuevaPagina(MOVIL);
  await page.goto(URL_APP);
  await page.waitForSelector("#f-acceso");
  assert.ok(await sinDesborde(page), "desborde en la entrada");
  await page.click("#m-crear");
  await page.waitForTimeout(300);
  assert.ok(await sinDesborde(page), "desborde en el registro");
  await page.screenshot({ path: join(CAP, "registro-movil.png"), fullPage: true });
  await ctx.close();
});

await prueba("instructor: panel, tablero, Gente e Incompletos abren y marcan lo incompleto", async () => {
  const { ctx, page, errores } = await nuevaPagina();
  await entrar(page);
  await page.waitForSelector(".kpi");
  await page.waitForSelector("#d-usuarios");
  await page.waitForTimeout(900);
  await page.screenshot({ path: join(CAP, "dashboard-instructor.png"), fullPage: true });
  assert.ok(await page.locator(".kpi").count() >= 6, "faltan tarjetas de cifras (con superusuario son 6)");
  assert.ok(await page.locator(".dona .arco").count() >= 1, "falta la gráfica de veredictos");
  assert.ok(await page.locator(".hb-f").count() >= 1, "faltan las barras de equipos");
  assert.ok((await page.textContent("#d-usuarios")).includes("Ana Rivera"), "falta la lista de usuarios");
  await page.fill("#d-buscar", "luis");
  assert.ok(!(await page.textContent("#d-usuarios")).includes("Ana Rivera"), "la búsqueda no filtra");
  await page.fill("#d-buscar", "");
  await page.click('.kpi[data-ir="informes:incompletos"]');
  await page.waitForSelector(".grupo-falta");        // el botón lleva directo al informe
  await page.click(nav("inicio"));
  await page.waitForSelector(".kpi");
  await page.click(nav("instructor"));
  await page.waitForSelector("#p-gente");
  await page.waitForSelector(".t-fila");
  assert.ok(await page.locator('.t-fila[data-v="inc"]').count() >= 1, "falta marcar la hoja incompleta (círculo discontinuo con !)");
  assert.ok(await page.locator('.t-fila[data-v="inc"] .estado svg use[href="#g-inc"]').count() >= 1, "la hoja incompleta lleva el glifo de incompleto, no solo color");
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(CAP, "tablero.png") });

  await page.click("#p-gente");
  await page.waitForSelector("#f-nuevo-est");
  assert.ok((await page.textContent("#cuerpo-gente")).includes("Pide ser instructor"));
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(CAP, "gente.png"), fullPage: true });

  await page.click("#p-informes");
  await page.click('[data-informe="incompletos"]');
  await page.waitForSelector(".grupo-falta");
  assert.ok(await page.locator('.estado[data-v="inc"]').count() >= 1, "falta el chip de incompleto");
  assert.ok(await page.locator('.estado[data-v="inc"] use[href="#g-inc"]').count() >= 1, "falta el círculo discontinuo con !");
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(CAP, "incompletos.png"), fullPage: true });

  await page.click('[data-informe="estudiante"]');
  await page.locator(".gt-b").first().scrollIntoViewIfNeeded();           // las barras entran al verse: con el héroe alto la gráfica queda bajo el pliegue
  await page.waitForSelector(".gt-b i");
  assert.ok(await page.locator(".gt-b i").count() >= 1, "falta la gráfica de trabajo acumulado");
  assert.deepEqual(errores, []);
  await ctx.close();
});

await prueba("instructor en teléfono: tablero, Gente e informes sin desborde de página", async () => {
  const { ctx, page } = await nuevaPagina(MOVIL);
  await entrar(page);
  await page.waitForSelector(".kpi");
  assert.ok(await sinDesborde(page), "desborde en el dashboard del instructor");
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 375, "el ancho de la página debe ser el del teléfono");
  await page.click(nav("instructor"));
  await page.waitForSelector("#p-gente");
  assert.ok(await sinDesborde(page), "desborde en el tablero");
  await page.click("#p-gente");
  await page.waitForSelector("#f-nuevo-est");
  assert.ok(await sinDesborde(page), "desborde en Gente");
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(CAP, "gente-movil.png") });
  await ctx.close();
});

await prueba("estudiante: su dashboard muestra su trabajo, lo pendiente y sus botones", async () => {
  const { ctx, page, errores } = await nuevaPagina();
  await entrar(page, "ana");
  await page.waitForSelector(".kpi");
  await page.waitForTimeout(900);
  await page.screenshot({ path: join(CAP, "dashboard-estudiante.png"), fullPage: true });
  assert.ok((await page.textContent("h1")).includes("Ana"));
  assert.ok(await page.locator("#d-nuevo").count() === 1, "falta el botón Nuevo diagnóstico");
  assert.equal(await page.locator('[data-nav="instructor"]').count(), 0, "un estudiante no debe ver El taller");
  assert.ok(await page.locator(".dona .arco").count() >= 1);
  assert.ok(await page.locator(".cols .col").count() === 8, "8 semanas de actividad");
  assert.ok((await page.textContent(".kpis")).includes("95"), "falta la nota media");
  await page.click(nav("panel"));
  await page.waitForSelector(".tarjeta");
  await page.click(nav("inicio"));
  await page.waitForSelector(".kpi");
  assert.deepEqual(errores, []);
  await ctx.close();
});

await prueba("tacto: sin hover pegado, sin destello al tocar, sin retraso, con teclado y esquinas", async () => {
  const { ctx, page } = await nuevaPagina(MOVIL);
  await page.goto(URL_APP);
  await page.waitForSelector("#f-acceso");
  assert.equal(await page.evaluate(() => matchMedia("(hover: hover) and (pointer: fine)").matches), false);
  const btn = page.locator("#a-enviar");
  await btn.hover();                                   // en un teléfono el "hover" queda pegado tras tocar
  await page.waitForTimeout(260);
  assert.equal(await btn.evaluate(el => getComputedStyle(el).transform), "none");
  const estilo = await btn.evaluate(el => ({ ta: getComputedStyle(el).touchAction, us: getComputedStyle(el).userSelect }));
  assert.equal(estilo.ta, "manipulation");
  assert.equal(estilo.us, "none");
  // Chromium de escritorio no expone esta propiedad ya calculada: se comprueba en la hoja de estilo
  assert.ok((await (await page.request.get(URL_APP + "estilo.css")).text()).includes("-webkit-tap-highlight-color:transparent"));
  const meta = await page.$eval('meta[name="viewport"]', m => m.content);
  assert.match(meta, /viewport-fit=cover/); assert.match(meta, /interactive-widget=resizes-content/);
  assert.equal(await page.locator('meta[name="theme-color"]').count(), 2);
  const px = await page.$eval("#a-usuario", el => parseFloat(getComputedStyle(el).fontSize));
  assert.ok(px >= 16, "iOS hace zoom con letra menor de 16px");
  await ctx.close();
});

await prueba("estudiante en teléfono: dashboard sin desborde y con navegación a un toque", async () => {
  const { ctx, page } = await nuevaPagina(MOVIL);
  await entrar(page, "luis");
  await page.waitForSelector(".kpi");
  await page.waitForTimeout(900);
  assert.ok(await sinDesborde(page), "desborde en el dashboard");
  assert.ok(await page.locator(".alerta-panel").count() === 1, "Luis tiene una hoja incompleta y debe verse");
  assert.equal(await page.$eval("main", m => m.dataset.vista), "inicio");
  await page.screenshot({ path: join(CAP, "dashboard-movil.png"), fullPage: true });
  await ctx.close();
});

await prueba("dashboard del teléfono: una sección a la vez, barra de abajo y lista de usuarios", async () => {
  const { ctx, page, errores } = await nuevaPagina(MOVIL);
  await entrar(page);
  await page.waitForSelector(".kpi");
  await page.waitForTimeout(700);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 375);
  const pos = await page.$eval(".nav-baja", el => getComputedStyle(el).position);
  assert.equal(pos, "sticky", "la navegación va abajo en el teléfono (sticky, último hijo de #app)");
  assert.ok(await page.locator(".tabs-m").isVisible(), "faltan las pestañas del dashboard");
  assert.ok(await page.locator(".kpis").isVisible());
  assert.equal(await page.locator(".dona").first().isVisible(), false, "las gráficas no deben verse en Resumen");
  await page.screenshot({ path: join(CAP, "movil-resumen.png") });
  await page.click('.tabs-m [data-sec="graficas"]');
  assert.ok(await page.locator(".dona").first().isVisible(), "Gráficas debe mostrar las gráficas");
  assert.equal(await page.locator(".kpis").isVisible(), false);
  await page.waitForTimeout(600);
  await page.screenshot({ path: join(CAP, "movil-graficas.png"), fullPage: true });
  await page.click('.tabs-m [data-sec="gente"]');
  assert.ok(await page.locator("#d-usuarios table.apila tbody tr").first().isVisible(), "la gente va como tarjetas");
  assert.equal(await page.evaluate(() => { const e = document.querySelector("#d-usuarios .tabla-env"); return !e || e.scrollWidth <= e.clientWidth + 1; }), true, "sin scroll lateral en la tabla de gente");
  await page.screenshot({ path: join(CAP, "movil-gente.png"), fullPage: true });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 375);
  assert.deepEqual(errores, []);
  await ctx.close();
});

await prueba("pantalla grande: el dashboard se ve completo, sin pestañas de teléfono ni barra de abajo", async () => {
  const { ctx, page } = await nuevaPagina();
  await entrar(page);
  await page.waitForSelector(".kpi");
  assert.equal(await page.locator(".tabs-m").isVisible(), false);
  assert.ok(await page.locator(".dona").first().isVisible() && await page.locator(".kpis").isVisible());
  assert.equal(await page.locator(".nav-baja").isVisible(), false);
  await page.waitForTimeout(800);
  await page.screenshot({ path: join(CAP, "escritorio-instructor.png"), fullPage: true });
  await ctx.close();
});

/* ---------------- chasis: recinto, modo, barra, navegación, pie ---------------- */
console.log("Chasis");

await prueba("entrada y barra: sello ITPR, chip con el nombre del recinto, modo y pie con el aval, en los tres recintos", async () => {
  // quien entra en cada recinto: su perfil ya trae ese recinto
  for (const [r, nombre, quien] of [["itpr", "ITPR", "guille"], ["sanjuan", "San Juan", "prof"], ["manati", "Manatí", "ana"]]) {
    const { ctx, page, errores } = await nuevaPagina({ viewport: { width: 1280, height: 800 } });
    await page.addInitScript(id => { try { localStorage.setItem("bitacora:recinto", id); } catch (_) {} }, r);
    await page.goto(URL_APP);
    await page.waitForSelector("#f-acceso");
    assert.equal(await page.$eval("html", h => h.dataset.recinto), r);
    // la entrada: cabecera propia con sello ITPR sobre su placa, chip del recinto y modo
    const chip = page.locator(".e-tope .rec-btn");
    assert.equal(await chip.getAttribute("aria-label"), `Recinto: ${nombre}, cambiar`);
    assert.ok((await chip.textContent()).includes(nombre), "el chip debe decir el nombre visible");
    assert.ok(await page.locator(".e-tope .sello img").isVisible(), "falta la marca ITPR en su placa");
    assert.ok(await page.locator(".e-tope [data-modo-btn]").isVisible());
    assert.equal(await page.locator(".e-h1:visible").count(), 1, "un solo titular del recinto a la vista");
    assert.equal(await page.locator(".e-izq .tile-rec").count(), 3, "las tres tarjetas Elige tu recinto");
    assert.equal(await page.locator(".e-der .placa-depr img").isVisible(), true, "falta la placa del DEPR en la entrada");
    // ya dentro: barra de arriba y pie del chasis
    await entrar(page, quien);
    assert.equal(await page.$eval("html", h => h.dataset.recinto), r);
    const chip2 = page.locator(".barra .rec-btn");
    assert.equal(await chip2.getAttribute("aria-label"), `Recinto: ${nombre}, cambiar`);
    assert.ok(await page.locator(".barra .sello img").isVisible(), "falta la marca ITPR en su placa");
    assert.ok(await page.locator('.barra [data-modo-btn]').isVisible());
    assert.match(await page.textContent(".pie"), /Con el aval del Departamento de Educación/);
    assert.ok(await page.locator('.pie .placa-depr img').isVisible(), "falta la placa del DEPR");
    assert.equal(await page.locator(".pie .placa-campus img:visible").count(), 1, "una sola insignia del recinto en el pie");
    assert.equal(await page.$eval(".pie", p => p.dataset.nombre), { itpr: "ITPR", sanjuan: "Tiburones", manati: "Pumas" }[r]);
    await page.waitForTimeout(500);
    await page.screenshot({ path: join(CAP, `chasis-${r}-1280.png`), fullPage: true });
    assert.deepEqual(errores, []);
    await ctx.close();
  }
});

await prueba("recinto y modo se aplican antes del primer pintado (script del <head>)", async () => {
  const { ctx, page } = await nuevaPagina();
  await page.addInitScript(() => { try { localStorage.setItem("bitacora:recinto", "manati"); localStorage.setItem("bitacora:modo", "oscuro"); } catch (_) {} });
  await page.route("**/app.js", r => r.abort());         // sin la app: solo cuenta lo que hizo el script del head
  await page.goto(URL_APP, { waitUntil: "domcontentloaded" });
  const h = await page.evaluate(() => ({ r: document.documentElement.dataset.recinto, m: document.documentElement.dataset.modo,
    t: [...document.querySelectorAll('meta[name="theme-color"]')].map(x => x.content) }));
  assert.equal(h.r, "manati"); assert.equal(h.m, "oscuro");
  assert.deepEqual(h.t, ["#10294D", "#10294D"]);
  await ctx.close();
});

await prueba("teléfono: cambiar de recinto desde la hoja de abajo, sin desborde antes ni después, con aviso y recuerdo", async () => {
  const { ctx, page, errores } = await nuevaPagina(MOVIL);
  await page.goto(URL_APP);
  await page.waitForSelector("#f-acceso");
  assert.ok(await sinDesborde(page), "desborde antes del cambio");
  for (const [r, nombre, aviso] of [["sanjuan", "San Juan", "Ahora estás en el recinto de San Juan"], ["manati", "Manatí", "Ahora estás en el recinto de Manatí"], ["itpr", "ITPR", "Ahora estás en el Sistema ITPR"]]) {
    await page.click(".rec-btn");
    await page.waitForSelector("dialog.hoja-rec[open]");
    const caja = await page.locator("dialog.hoja-rec").boundingBox();
    assert.ok(caja.x >= 0 && caja.x + caja.width <= 376, "la hoja se sale de la pantalla");
    await page.click(`dialog.hoja-rec [data-ir-recinto="${r}"]`);
    await page.waitForFunction(id => document.documentElement.dataset.recinto === id, r);
    await page.waitForTimeout(700);
    assert.equal(await page.evaluate(() => localStorage.getItem("bitacora:recinto")), r);
    assert.equal(await page.locator("#toast").textContent(), aviso);
    assert.equal(await page.getAttribute(".rec-btn", "aria-label"), `Recinto: ${nombre}, cambiar`);
    assert.ok(await sinDesborde(page), `desborde tras cambiar a ${r}`);
    assert.equal(await page.evaluate(() => document.querySelector("dialog.hoja-rec").open), false);
    await page.screenshot({ path: join(CAP, `chasis-${r}-375.png`), fullPage: true });
  }
  assert.deepEqual(errores, []);
  await ctx.close();
});

await prueba("escritorio: el menú de recinto se maneja con teclado (flechas, Enter, Escape) y no cambia con cada flecha", async () => {
  const { ctx, page } = await nuevaPagina();
  await page.goto(URL_APP);
  await page.waitForSelector("#f-acceso");
  const chip = page.locator(".rec-btn");
  await chip.focus();
  await page.keyboard.press("Enter");
  assert.equal(await chip.getAttribute("aria-expanded"), "true");
  assert.equal(await page.evaluate(() => document.activeElement.dataset.irRecinto), "itpr");      // abre sobre el recinto actual
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  assert.equal(await page.evaluate(() => document.activeElement.dataset.irRecinto), "manati");
  assert.equal(await page.$eval("html", h => h.dataset.recinto), "itpr", "una flecha solo mueve el foco");
  await page.keyboard.press("Escape");
  assert.equal(await chip.getAttribute("aria-expanded"), "false");
  assert.equal(await page.evaluate(() => document.activeElement.classList.contains("rec-btn")), true, "Escape devuelve el foco al chip");
  await page.keyboard.press("Enter");
  await page.keyboard.press("ArrowDown"); await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => document.documentElement.dataset.recinto === "manati");
  assert.equal(await page.evaluate(() => document.activeElement.classList.contains("rec-btn")), true, "elegir con Enter devuelve el foco al chip (no a <body>)");
  assert.equal(await chip.getAttribute("aria-expanded"), "false");
  // y con el ratón: el foco vuelve al chip también
  await chip.click(); await page.click('.menu-rec [data-ir-recinto="sanjuan"]');
  await page.waitForFunction(() => document.documentElement.dataset.recinto === "sanjuan");
  assert.equal(await page.evaluate(() => document.activeElement.classList.contains("rec-btn")), true);
  await ctx.close();
});

await prueba("dos cambios de recinto seguidos: la transición vieja no apaga la nueva ni anuncia el recinto equivocado", async () => {
  const { ctx, page, errores } = await nuevaPagina();
  await page.goto(URL_APP);
  await page.waitForSelector("#f-acceso");
  await page.evaluate(async () => { const c = await import("./campus.js"); window.__c = c; c.cambiarRecinto("sanjuan"); });
  await page.waitForFunction(() => document.documentElement.dataset.recinto === "sanjuan");
  await page.evaluate(() => window.__c.cambiarRecinto("manati"));
  await page.waitForTimeout(120);
  assert.equal(await page.evaluate(() => document.documentElement.classList.contains("revelando")), true, "la segunda revelación sigue en curso con su propio recorte");
  await page.waitForTimeout(1500);
  assert.equal(await page.evaluate(() => document.documentElement.classList.contains("revelando")), false, "al terminar se limpia");
  assert.equal(await page.$eval("html", h => h.dataset.recinto), "manati");
  assert.equal(await page.locator("#toast").textContent(), "Ahora estás en el recinto de Manatí", "el aviso es del recinto que quedó");
  assert.deepEqual(errores, []);
  await ctx.close();
});

await prueba("ITPR y Pumas se distinguen sin color: el campo de Manatí es mucho más oscuro que el de ITPR en claro y en oscuro", async () => {
  const { ctx, page } = await nuevaPagina();
  await page.goto(URL_APP);
  await page.waitForSelector("#f-acceso");
  const campos = await page.evaluate(() => {
    const raiz = document.documentElement, salida = {};
    for (const modo of ["claro", "oscuro"]) for (const r of ["itpr", "sanjuan", "manati"]) {
      raiz.dataset.modo = modo; raiz.dataset.recinto = r;
      const p = document.createElement("span"); p.style.color = getComputedStyle(raiz).getPropertyValue("--field").trim(); document.body.append(p);
      salida[modo + "/" + r] = getComputedStyle(p).color.match(/[\d.]+/g).slice(0, 3).map(Number); p.remove();
    }
    return salida;
  });
  const lum = ([r, g, b]) => { const f = v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }; return .2126 * f(r) + .7152 * f(g) + .0722 * f(b); };
  const razon = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + .05) / (y + .05); };
  for (const modo of ["claro", "oscuro"]) {
    const r = razon(campos[modo + "/itpr"], campos[modo + "/manati"]);
    assert.ok(r >= 1.5, `${modo}: el campo de ITPR y el de Manatí solo se separan ${r.toFixed(2)}:1 en escala de grises`);
  }
  await ctx.close();
});

await prueba("sin señal: el recinto elegido queda pendiente y se sube al volver; el de otra persona en este equipo no pasa al perfil de quien entra", async () => {
  const a = await nuevaPagina();
  await entrar(a.page, "ana");                                     // ana: manati
  await a.ctx.setOffline(true);
  await a.page.click(".rec-btn");
  await a.page.click('.menu-rec [data-ir-recinto="sanjuan"]');
  await a.page.waitForFunction(() => document.documentElement.dataset.recinto === "sanjuan");
  assert.equal(await a.page.evaluate(() => localStorage.getItem("bitacora:recinto-pendiente")), "sanjuan");
  await a.ctx.setOffline(false);
  const antes = escrituras.length;
  await a.page.reload();
  await a.page.waitForSelector("main[data-vista=inicio]");
  await a.page.waitForTimeout(500);
  assert.equal(await a.page.$eval("html", h => h.dataset.recinto), "sanjuan", "la elección sin señal no se pierde");
  assert.ok(escrituras.slice(antes).some(e => e.tabla === "perfiles" && e.cambios.recinto === "sanjuan"), "y se sube al perfil");
  assert.equal(await a.page.evaluate(() => localStorage.getItem("bitacora:recinto-pendiente")), null);
  // equipo compartido: sale ana, entra luis (sin recinto en el perfil): el recinto de ana no se le escribe a luis
  await a.page.click("#b-salir");
  await a.page.waitForSelector("#f-acceso");
  const antes2 = escrituras.length;
  await entrar(a.page, "luis");
  await a.page.waitForTimeout(500);
  assert.equal(escrituras.slice(antes2).filter(e => e.tabla === "perfiles" && "recinto" in e.cambios).length, 0, "el recinto de la persona anterior no es la elección de quien entra");
  PERFILES.find(p => p.id === "e1").recinto = "manati"; PERFILES.find(p => p.id === "e2").recinto = "";
  await a.ctx.close();
});

await prueba("modo claro / oscuro: el botón alterna, se recuerda y la barra del sistema lo sigue", async () => {
  const { ctx, page } = await nuevaPagina();
  await page.goto(URL_APP);
  await page.waitForSelector("#f-acceso");
  await page.click("[data-modo-btn]");
  await page.waitForFunction(() => document.documentElement.dataset.modo === "oscuro");
  assert.equal(await page.evaluate(() => localStorage.getItem("bitacora:modo")), "oscuro");
  assert.equal(await page.getAttribute("[data-modo-btn]", "aria-pressed"), "true");
  assert.deepEqual(await page.$$eval('meta[name="theme-color"]', m => m.map(x => x.content)), ["#0B5E99", "#0B5E99"]);
  await page.waitForTimeout(300);
  assert.equal(await page.$eval("body", b => getComputedStyle(b).backgroundColor), "rgb(18, 19, 20)");
  await page.reload();
  await page.waitForSelector("#f-acceso");
  assert.equal(await page.$eval("html", h => h.dataset.modo), "oscuro");
  await ctx.close();
});

await prueba("al entrar manda el recinto del perfil; sin recinto se queda el del equipo, y solo se guarda en el perfil lo que se eligió a propósito", async () => {
  const { ctx, page } = await nuevaPagina();
  await entrar(page, "ana");                                       // ana: manati
  assert.equal(await page.$eval("html", h => h.dataset.recinto), "manati");
  assert.equal(await page.evaluate(() => localStorage.getItem("bitacora:recinto")), "manati");
  await ctx.close();
  const b = await nuevaPagina();
  await b.page.addInitScript(() => { try { localStorage.setItem("bitacora:recinto", "sanjuan"); } catch (_) {} });
  const antes = escrituras.length;
  await entrar(b.page, "luis");                                    // luis: sin recinto
  assert.equal(await b.page.$eval("html", h => h.dataset.recinto), "sanjuan");
  await b.page.waitForTimeout(300);
  assert.equal(escrituras.slice(antes).filter(e => e.tabla === "perfiles" && "recinto" in e.cambios).length, 0, "lo que solo recuerda el equipo no se escribe en el perfil");
  await b.ctx.close();
  // en cambio, lo que se elige a propósito antes de entrar (una tarjeta de la entrada) sí se guarda al entrar
  const c = await nuevaPagina();
  await c.page.goto(URL_APP);
  await c.page.waitForSelector("#f-acceso");
  await c.page.click('.tile-rec[data-recinto="manati"]');
  await c.page.waitForFunction(() => document.documentElement.dataset.recinto === "manati");
  const antes3 = escrituras.length;
  await entrar(c.page, "luis");
  await c.page.waitForTimeout(400);
  assert.ok(escrituras.slice(antes3).some(e => e.tabla === "perfiles" && e.cambios.recinto === "manati"), "la tarjeta elegida antes de entrar debe guardarse en el perfil");
  PERFILES.find(p => p.id === "e2").recinto = "";
  await c.ctx.close();
});

await prueba("cambiar de recinto con sesión lo guarda en el perfil", async () => {
  const { ctx, page } = await nuevaPagina();
  await entrar(page, "prof");                                      // prof: sanjuan
  assert.equal(await page.$eval("html", h => h.dataset.recinto), "sanjuan");
  const antes = escrituras.length;
  await page.click(".rec-btn");
  await page.click('.menu-rec [data-ir-recinto="manati"]');
  await page.waitForFunction(() => document.documentElement.dataset.recinto === "manati");
  await page.waitForTimeout(500);
  assert.ok(escrituras.slice(antes).some(e => e.tabla === "perfiles" && e.cambios.recinto === "manati"));
  PERFILES.find(p => p.id === "i1").recinto = "sanjuan";
  await ctx.close();
});

await prueba("navegación de abajo (teléfono): Nuevo relleno, insignia de incompletas, oculta en el editor, sin tapar el pie", async () => {
  const { ctx, page } = await nuevaPagina(MOVIL);
  await entrar(page, "luis");
  const nb = page.locator(".nav-baja");
  assert.ok(await nb.isVisible());
  assert.ok(await nb.locator(".nav-nuevo").isVisible(), "falta el botón Nuevo");
  assert.match(await nb.locator('a[data-nav="panel"]').textContent(), /1/);
  assert.match(await nb.locator('a[data-nav="panel"] .sr').textContent(), /1 hoja incompleta/);
  const ultimo = await page.evaluate(() => document.querySelector("#app").lastElementChild.className);
  assert.match(ultimo, /nav-baja/, "la navegación de abajo es el último hijo de #app");
  // al fondo de la página, la navegación queda debajo del pie y no encima
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(200);
  const [cajaPie, cajaNav] = await Promise.all([page.locator(".pie").boundingBox(), nb.boundingBox()]);
  assert.ok(cajaPie.y + cajaPie.height <= cajaNav.y + 1, "la navegación tapa el pie");
  await page.evaluate(() => window.scrollTo(0, 0));
  await nb.locator(".nav-nuevo").click();
  await page.waitForSelector('main[data-vista="editor"]');
  assert.equal(await page.locator(".nav-baja").count(), 0, "en el editor no hay navegación de abajo");
  assert.equal(await page.locator(".pie").count(), 0, "en el editor no hay pie");
  await ctx.close();
});

await prueba("nombre largo en el titular: no se corta ni desborda a 320, 375 y 390", async () => {
  for (const ancho of [320, 375, 390]) {
    const { ctx, page } = await nuevaPagina({ viewport: { width: ancho, height: 760 }, isMobile: true, hasTouch: true });
    await page.goto(URL_APP);
    await page.waitForSelector("#f-acceso");
    // titular de prueba con el mismo marcado que usarán las pantallas
    await page.evaluate(async () => {
      const { ajustarTitulares } = await import("./campus.js");
      const h = document.createElement("section");
      h.className = "cap hero campo";
      h.innerHTML = '<div class="in hero-in"><h1 class="h1"><span class="linea"><span>Hola,</span></span> <span class="linea"><span>Guillermina</span></span></h1></div>';
      document.querySelector("main").prepend(h);
      ajustarTitulares(h);
    });
    const r = await page.evaluate(() => [...document.querySelectorAll(".hero .linea > span")].map(s => s.scrollWidth <= s.clientWidth + 1));
    assert.deepEqual(r, [true, true], `se corta a ${ancho}`);
    assert.ok(await sinDesborde(page), `desborde a ${ancho}`);
    await ctx.close();
  }
});

await prueba("reducir movimiento: el cambio de recinto es un fundido, sin recorte, y cambia igual", async () => {
  const { ctx, page, errores } = await nuevaPagina({ reducedMotion: "reduce" });
  await page.goto(URL_APP);
  await page.waitForSelector("#f-acceso");
  await page.click(".rec-btn");
  await page.click('.menu-rec [data-ir-recinto="manati"]');
  await page.waitForFunction(() => document.documentElement.dataset.recinto === "manati");
  assert.equal(await page.evaluate(() => document.documentElement.classList.contains("revelando")), false);
  await page.waitForTimeout(600);
  assert.equal(await page.locator("#toast").textContent(), "Ahora estás en el recinto de Manatí");
  assert.deepEqual(errores, []);
  await ctx.close();
});

await prueba("las tarjetas del pie también cambian el recinto", async () => {
  const { ctx, page, errores } = await nuevaPagina({ viewport: { width: 1280, height: 800 } });
  await entrar(page, "guille");                                  // guille: itpr
  await page.click('.pie [data-recinto="sanjuan"]');                // las tarjetas del pie también cambian el recinto
  await page.waitForFunction(() => document.documentElement.dataset.recinto === "sanjuan");
  assert.equal(await page.getAttribute('.pie [data-recinto="sanjuan"]', "aria-pressed"), "true");
  assert.deepEqual(errores, []);
  await ctx.close();
});

/* ---------------- recinto: cambio completo, primer pintado, marcas ---------------- */
console.log("Identidad por recinto");

// Colores de la barra del sistema (los mismos del script del <head> de index.html): [claro, oscuro]
const BARRA = { itpr: ["#05568D", "#0B5E99"], sanjuan: ["#102A42", "#1E4365"], manati: ["#0C1A2E", "#10294D"] };
const NOMBRE_R = { itpr: "ITPR", sanjuan: "San Juan", manati: "Manatí" };
const AVISO_R = { itpr: "Ahora estás en el Sistema ITPR", sanjuan: "Ahora estás en el recinto de San Juan", manati: "Ahora estás en el recinto de Manatí" };

await prueba("cambio de recinto itpr -> sanjuan -> manati: atributo, localStorage, theme-color, aviso aria-live y sin desborde, en escritorio y teléfono", async () => {
  for (const [nombre, opc] of [["escritorio", { viewport: { width: 1280, height: 800 } }], ["teléfono", MOVIL]]) {
    const { ctx, page, errores } = await nuevaPagina(opc);
    await page.goto(URL_APP);
    await page.waitForSelector("#f-acceso");
    assert.equal(await page.$eval("html", h => h.dataset.recinto), "itpr");
    assert.equal(await page.getAttribute("#toast", "role"), "status");
    assert.equal(await page.getAttribute("#toast", "aria-live"), "polite");
    for (const r of ["sanjuan", "manati"]) {
      await page.click(`.e-izq .tile-rec[data-recinto="${r}"]`);
      await page.waitForFunction(id => document.documentElement.dataset.recinto === id, r);
      await page.waitForTimeout(700);
      assert.equal(await page.evaluate(() => localStorage.getItem("bitacora:recinto")), r, nombre + ": no se recordó");
      assert.deepEqual(await page.$$eval('meta[name="theme-color"]', m => m.map(x => x.content)), BARRA[r], nombre + ": theme-color");
      assert.equal(await page.locator("#toast").textContent(), AVISO_R[r], nombre + ": aviso");
      assert.equal(await page.getAttribute(".e-tope .rec-btn", "aria-label"), `Recinto: ${NOMBRE_R[r]}, cambiar`);
      assert.equal(await page.getAttribute(`.e-izq .tile-rec[data-recinto="${r}"]`, "aria-pressed"), "true");
      assert.equal(await page.locator(".e-h1:visible").count(), 1, nombre + ": un solo titular");
      assert.ok(await sinDesborde(page), `${nombre}: desborde tras cambiar a ${r}`);
    }
    // vuelve a ITPR por el chip y el modo oscuro cambia la barra del sistema a su segundo color
    await page.click(".e-tope .rec-btn");
    await page.click('[data-ir-recinto="itpr"]:visible');
    await page.waitForFunction(() => document.documentElement.dataset.recinto === "itpr");
    await page.click("[data-modo-btn]");
    await page.waitForFunction(() => document.documentElement.dataset.modo === "oscuro");
    assert.deepEqual(await page.$$eval('meta[name="theme-color"]', m => m.map(x => x.content)), [BARRA.itpr[1], BARRA.itpr[1]]);
    assert.deepEqual(errores, [], nombre);
    await ctx.close();
  }
});

await prueba("primer pintado: con el recinto y el modo guardados, el atributo ya está puesto antes de DOMContentLoaded y del primer pintado, y nunca vuelve a ITPR", async () => {
  for (const [r, m] of [["manati", "oscuro"], ["sanjuan", "claro"]]) {
    const { ctx, page } = await nuevaPagina({ colorScheme: m === "oscuro" ? "dark" : "light" });
    await page.addInitScript(([r, m]) => { try { localStorage.setItem("bitacora:recinto", r); localStorage.setItem("bitacora:modo", m); } catch (_) {} }, [r, m]);
    await page.addInitScript(() => {
      const v = window.__pre = { valores: [], dcl: null, fp: null };      // en este punto <html> todavía no existe: se lee al momento
      const foto = () => { const d = document.documentElement; return { r: d.dataset.recinto, m: d.dataset.modo || "", fondo: document.body ? getComputedStyle(document.body).backgroundColor : "" }; };
      new MutationObserver(() => v.valores.push(document.documentElement.dataset.recinto)).observe(document, { attributes: true, subtree: true, attributeFilter: ["data-recinto"] });
      document.addEventListener("DOMContentLoaded", () => { v.dcl = foto(); });
      requestAnimationFrame(() => { v.fp = foto(); });      // el primer fotograma, antes de pintarlo
    });
    await page.goto(URL_APP);
    await page.waitForSelector("#f-acceso");
    await page.waitForFunction(() => window.__pre.fp && window.__pre.dcl);
    const pre = await page.evaluate(() => window.__pre);
    assert.equal(pre.dcl.r, r, "en DOMContentLoaded");
    assert.equal(pre.dcl.m, m);
    assert.equal(pre.fp.r, r, "en el primer pintado");
    assert.equal(pre.fp.m, m);
    assert.ok(pre.valores.every(x => x === r), "el atributo pasó por otro recinto: " + pre.valores.join(","));
    assert.ok(!(await page.evaluate(() => document.documentElement.classList.contains("revelando"))), "el arranque no es un cambio de recinto");
    await ctx.close();
  }
});

await prueba("marcas oficiales en todas las pantallas (3 recintos x 2 modos, 375 y 1280): sin giro, recorte, filtro ni deformación; tamaños mínimos; sobre placa clara, nunca sobre rojo, oro ni #05568D", async () => {
  const recintos = Object.fromEntries(PERFILES.map(x => [x.usuario, x.recinto]));
  const fallas = []; let revisadas = 0;
  try {
    for (const pantalla of Object.keys(PANTALLAS)) for (const modo of ["claro", "oscuro"]) for (const [i, recinto] of ["itpr", "sanjuan", "manati"].entries()) {
      const ancho = (i + (modo === "oscuro" ? 1 : 0)) % 2 ? 1280 : 375;
      const movil = ancho < 500;
      const { ctx, page } = await nuevaPagina({ viewport: { width: ancho, height: movil ? 800 : 900 }, ...(movil ? { isMobile: true, hasTouch: true } : {}) });
      try {
        await abrirPantalla(page, pantalla, { recinto, modo });
        const r = await auditarMarcas(page, `${pantalla}/${recinto}/${modo}/${ancho}`, { espera: 600 });
        revisadas += r.revisadas; fallas.push(...r.fallas);
      } catch (e) { fallas.push(`${pantalla}/${recinto}/${modo}/${ancho}: ${e.message.split("\n")[0]}`); }
      await ctx.close();
    }
  } finally { PERFILES.forEach(x => { x.recinto = recintos[x.usuario]; }); }
  assert.ok(revisadas > 100, "se revisaron pocas marcas: " + revisadas);
  assert.equal(fallas.length, 0, fallas.slice(0, 6).join(" || "));
});

await terminar();
