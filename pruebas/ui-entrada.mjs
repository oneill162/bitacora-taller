// Pruebas del área "Entrada y hojas": la entrada (acceso.js + v-acceso.css) y la lista Mis hojas.
//   node pruebas/ui-entrada.mjs
// Cubre: render en los 3 recintos x 2 modos sin errores de consola, sin desborde lateral (scrollWidth y scrollTo real) a
// 320/375/390/768/1280, controles de 44px o más en el teléfono, movimiento reducido, auditoría de marcas oficiales,
// y las interacciones: conmutar entrar/crear, recinto del registro (cuerpo de `registro`), formulario primero en el teléfono
// con recinto recordado, filas con estados, filtros, vacío, solicitud de instructor en tono de información, correo y XSS.
import assert from "node:assert/strict";
const { URL_APP, HOY, PERFILES, prueba, terminar, nuevaPagina, entrar, sinDesborde } = await import("./arnes.mjs");

const RECINTOS = ["itpr", "sanjuan", "manati"], MODOS = ["claro", "oscuro"];
const TITULO = { itpr: "Revisa con método.", sanjuan: "Revisa a fondo.", manati: "Revisa con garra." };
const movil = (w, h = 800) => ({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true });
const recordar = (page, r, m = "claro") => page.addInitScript(([r, m]) => {
  try { if (r) localStorage.setItem("bitacora:recinto", r); localStorage.setItem("bitacora:modo", m); } catch (_) {}
}, [r, m]);
const irAEntrada = async page => { await page.goto(URL_APP); await page.waitForSelector("#f-acceso"); };
const recorrer = page => page.evaluate(async () => {            // las entradas esperan a verse: se recorre la página para que terminen
  for (let y = 0; y < document.body.scrollHeight; y += 300) { scrollTo(0, y); await new Promise(f => setTimeout(f, 70)); }
  scrollTo(0, 0);
});

// Hojas de ejemplo de Luis (e2) en todos los estados. Sobreescribe la lista del arnés.
const eq = (id, serial, marca, modelo) => ({ id, serial, marca, modelo, tipo: "Laptop", inventario: "I", ubicacion: "S", creado_por: "e2" });
const base = { autor_id: "e2", fecha: HOY, estado: "entregado", sistema: "Windows 11", hallazgos: "Todo bien", comentario: "", actualizado_en: "2026-09-28T15:00:00Z" };
const OK = { ok: 40, obs: 0, falla: 0, na: 0, sin: 0 };
const HOJAS = [
  { ...base, id: "a1", orden: "DX-1", veredicto: "apto", conteo: OK, nota: 91, equipos: eq("q1", "ABC1234", "HP", "ProBook") },
  { ...base, id: "a2", orden: "DX-2", veredicto: "obs", conteo: { ok: 36, obs: 4, falla: 0, na: 0, sin: 0 }, nota: null, equipos: eq("q2", "LNV8841", "Lenovo", "T14") },
  { ...base, id: "a3", orden: "DX-3", veredicto: "no", conteo: { ok: 30, obs: 2, falla: 8, na: 0, sin: 0 }, nota: 74, equipos: eq("q3", "DEL3321", "Dell", "Latitude") },
  { ...base, id: "a4", orden: "DX-4", veredicto: "obs", conteo: { ok: 20, obs: 0, falla: 0, na: 0, sin: 20 }, sistema: "", hallazgos: "", nota: null, equipos: eq("q4", "XYZ99", "", "") },
  { ...base, id: "a5", orden: "DX-5", estado: "borrador", veredicto: "", conteo: {}, sistema: "", hallazgos: "", nota: null, equipos: eq("q5", "HPE0042", "HP", "EliteDesk") },
  { ...base, id: "a6", orden: "DX-6", veredicto: "apto", conteo: OK, nota: 100, equipos: eq("q6", "ACR7710", "<img src=x onerror=window.__xss=1>", "Aspire") }
];
const conHojas = (ctx, lista) => ctx.route("**/rest/v1/diagnosticos**", r =>
  r.request().method() === "GET" && !(r.request().headers().accept || "").includes("vnd.pgrst.object")
    ? r.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(lista) })
    : r.fallback());
const aMisHojas = async (page, quien = "luis") => {
  PERFILES.find(p => p.usuario === "luis").recinto = "";          // el arnés guarda el recinto en el perfil de mentira: se reinicia
  await entrar(page, quien);
  await page.click('[data-nav="panel"]:visible');
  await page.waitForSelector("main[data-vista=panel]");
  await page.waitForTimeout(250);
};

console.log("Entrada y Mis hojas");

await prueba("la entrada se ve en los 3 recintos y los 2 modos, con su titular y sin errores de consola", async () => {
  for (const r of RECINTOS) for (const m of MODOS) {
    const { ctx, page, errores } = await nuevaPagina();
    await recordar(page, r, m);
    await irAEntrada(page);
    assert.equal(await page.$eval("html", h => h.dataset.recinto), r);
    assert.equal(await page.$eval("html", h => h.dataset.modo), m);
    assert.equal(await page.locator(".e-h1:visible").count(), 1, `${r}: un solo titular visible`);
    const t = (await page.locator(".e-h1:visible").innerText()).replace(/\s+/g, " ").toLowerCase();
    assert.ok(t.includes(TITULO[r].toLowerCase()), `${r}: titular «${t}»`);
    assert.equal(await page.locator(".barra").isVisible(), false, "la entrada trae su propia cabecera");
    assert.equal(await page.getAttribute(`.tile-rec[data-recinto="${r}"]`, "aria-pressed"), "true");
    assert.ok(await page.locator(".e-aval .placa-depr img").isVisible(), "falta la placa del DEPR");
    assert.deepEqual(errores, [], `${r}/${m}`);
    await ctx.close();
  }
});

await prueba("sin desborde lateral en la entrada (entrar y crear) a 320, 375, 390, 768 y 1280, con scrollTo real", async () => {
  for (const w of [320, 375, 390, 768, 1280]) for (const r of RECINTOS) {
    const { ctx, page } = await nuevaPagina(w < 800 ? movil(w) : { viewport: { width: w, height: 800 } });
    await recordar(page, r);
    await irAEntrada(page);
    assert.ok(await sinDesborde(page), `entrada ${r}/${w}`);
    await page.click("#m-crear"); await page.waitForTimeout(300);
    assert.ok(await sinDesborde(page), `registro ${r}/${w}`);
    await ctx.close();
  }
});

await prueba("sin desborde lateral en Mis hojas a 320, 375, 390, 768 y 1280", async () => {
  for (const w of [320, 375, 390, 768, 1280]) {
    const { ctx, page } = await nuevaPagina(w < 800 ? movil(w) : { viewport: { width: w, height: 800 } });
    await conHojas(ctx, HOJAS);
    await aMisHojas(page);
    await recorrer(page);
    assert.ok(await sinDesborde(page), `Mis hojas ${w}`);
    await ctx.close();
  }
});

await prueba("teléfono: todos los controles de la entrada y de Mis hojas miden 44px o más", async () => {
  const medir = page => page.evaluate(() => [...document.querySelectorAll("main button, main a[href], main input:not([type=checkbox]):not([type=hidden]), main select, main textarea, main .opcion-l")]
    .filter(e => e.offsetParent !== null && !e.closest("[hidden]") && getComputedStyle(e).visibility !== "hidden")
    .map(e => { const r = e.getBoundingClientRect(); return { n: (e.id || e.className || e.tagName) + " «" + (e.textContent || "").trim().slice(0, 18) + "»", h: r.height, w: r.width }; })
    .filter(x => x.h > 0 && (x.h < 43.5 || x.w < 43.5)));
  for (const r of RECINTOS) {
    const { ctx, page } = await nuevaPagina(movil(375));
    await recordar(page, null);                                       // primera visita: se ven las tarjetas de recinto
    await irAEntrada(page);
    await page.click("#m-crear"); await page.waitForTimeout(250);
    assert.deepEqual(await medir(page), [], "entrada/registro " + r);
    await ctx.close();
  }
  const { ctx, page } = await nuevaPagina(movil(375));
  await conHojas(ctx, HOJAS);
  await aMisHojas(page);
  assert.deepEqual(await medir(page), [], "Mis hojas");
  await ctx.close();
});

await prueba("reducir movimiento: sin recorrido en los titulares, las entradas ni las filas", async () => {
  const { ctx, page } = await nuevaPagina({ reducedMotion: "reduce" });
  await conHojas(ctx, HOJAS);
  await irAEntrada(page);
  await page.waitForTimeout(500);
  assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector(".e-h1[data-t=itpr] .linea > span")).transform), "none");
  assert.equal(await page.$eval("#a-enviar", b => getComputedStyle(b.parentElement).transform), "none");
  await page.fill("#a-usuario", "luis"); await page.fill("#a-clave", "secreta1"); await page.click("#a-enviar");
  await page.waitForSelector("main[data-vista=inicio]");
  await page.click('[data-nav="panel"]:visible'); await page.waitForSelector(".tarjeta");
  await page.locator(".tarjeta").first().hover(); await page.waitForTimeout(260);
  assert.equal(await page.locator(".tarjeta").first().evaluate(e => getComputedStyle(e).transform), "none");
  await ctx.close();
});

await prueba("marcas oficiales en la entrada: sin giro, sin recorte, proporción y tamaño mínimo (3 recintos x 2 modos x 360/375/390/1280)", async () => {
  const MIN = { "tiburon.webp": 72, "puma.webp": 64, "itpr-marca.webp": 24, "itpr-manati.webp": 160, "itpr-manati-claro.webp": 160, "depr.webp": 140 };
  let revisadas = 0;
  for (const m of MODOS) for (const r of RECINTOS) for (const w of [360, 375, 390, 1280]) {
    const { ctx, page } = await nuevaPagina(w < 500 ? movil(w) : { viewport: { width: w, height: 900 } });
    await recordar(page, w < 500 ? null : r, m);                  // en teléfono, con recinto recordado las tarjetas se esconden: se audita la primera visita
    await irAEntrada(page);
    if (w < 500) await page.evaluate(r => { document.documentElement.dataset.recinto = r; }, r);
    await recorrer(page);
    await page.waitForTimeout(1900);
    const logos = await page.evaluate(() => [...document.querySelectorAll("main img")].filter(i => /\/img\/(tiburon|puma|itpr-marca|itpr-manati|itpr-manati-claro|depr)\.webp/.test(i.src)).map((img, n) => {
      const rc = img.getBoundingClientRect(), cs = getComputedStyle(img);
      if (!rc.width || !rc.height || cs.visibility === "hidden") return null;
      const cadena = []; for (let e = img; e && e !== document.documentElement; e = e.parentElement) cadena.push(e);
      const caja = cs.objectFit === "contain" || cs.objectFit === "scale-down" ? 0
        : Math.abs((rc.width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)) / (rc.height - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom)) / (img.naturalWidth / img.naturalHeight) - 1);
      // ¿algún ancestro con overflow que no sea visible deja la imagen sin entrar completa en su caja?
      const corta = cadena.slice(1).filter(e => { const o = getComputedStyle(e); return (o.overflowX !== "visible" || o.overflowY !== "visible") && e !== document.body && o.display !== "contents"; })
        .some(e => { const b = e.getBoundingClientRect(); return rc.left < b.left - .5 || rc.right > b.right + .5 || rc.top < b.top - .5 || rc.bottom > b.bottom + .5; });
      return { archivo: img.src.split("/").pop(), w: rc.width, caja,
        giros: cadena.map(e => getComputedStyle(e).transform).filter(t => t !== "none"),
        filtros: cadena.map(e => getComputedStyle(e).filter).filter(f => f !== "none"), corta };
    }).filter(Boolean));
    assert.ok(logos.length >= 4, `${r}/${m}/${w}: se esperaban al menos sello, 3 tarjetas y DEPR (hay ${logos.length})`);
    for (const l of logos) {
      revisadas++;
      const d = `${r}/${m}/${w} ${l.archivo}`;
      assert.deepEqual(l.giros, [], d + ": transform en la marca o un ancestro");
      assert.deepEqual(l.filtros, [], d + ": filtro");
      assert.ok(l.caja <= .01, d + ": deformada");
      assert.ok(l.w >= MIN[l.archivo] - .5, `${d}: ancho ${l.w.toFixed(0)} < ${MIN[l.archivo]}`);
      assert.ok(!l.corta, d + ": un ancestro con overflow la recorta");
    }
    await ctx.close();
  }
  assert.ok(revisadas > 100);
});

await prueba("conmutar Entrar / Crear cuenta: campos, textos, obligación del código y estado de la casilla de instructor", async () => {
  const { ctx, page, errores } = await nuevaPagina();
  await irAEntrada(page);
  assert.equal(await page.locator("#extra").isVisible(), false);
  assert.equal(await page.locator("#a-enviar").innerText(), "Entrar");
  await page.click("#m-crear");
  assert.equal(await page.locator("#extra").isVisible(), true);
  assert.equal(await page.getAttribute("#m-crear", "aria-pressed"), "true");
  assert.equal(await page.locator("#a-enviar").innerText(), "Crear mi cuenta");
  assert.equal(await page.$eval("#a-codigo", e => e.required), true);
  assert.equal(await page.getAttribute("#a-clave", "autocomplete"), "new-password");
  assert.match(await page.textContent("#e-titulo"), /Crea tu cuenta/);
  assert.ok(await page.locator("#a-instructor").isVisible() && await page.locator("#a-email").isVisible());
  await page.click("#m-entrar");
  assert.equal(await page.locator("#extra").isVisible(), false);
  assert.equal(await page.$eval("#a-codigo", e => e.required), false);
  assert.deepEqual(errores, []);
  await ctx.close();
});

await prueba("registro: el recinto sale preseleccionado, sigue a las tarjetas y viaja en el cuerpo de `registro`", async () => {
  const { ctx, page } = await nuevaPagina();
  let cuerpo = null;
  await ctx.route("**/functions/v1/registro", r => { cuerpo = JSON.parse(r.request().postData() || "{}"); return r.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: "{}" }); });
  await recordar(page, "sanjuan");
  await irAEntrada(page);
  await page.click("#m-crear");
  assert.equal(await page.inputValue("#a-recinto"), "sanjuan", "preseleccionado desde el recinto actual");
  await page.click('.tile-rec[data-recinto="manati"]');
  await page.waitForFunction(() => document.documentElement.dataset.recinto === "manati");
  assert.equal(await page.inputValue("#a-recinto"), "manati", "las tarjetas mueven el campo");
  await page.selectOption("#a-recinto", "itpr");
  await page.waitForFunction(() => document.documentElement.dataset.recinto === "itpr");
  assert.equal(await page.getAttribute('.tile-rec[data-recinto="itpr"]', "aria-pressed"), "true", "el campo mueve las tarjetas");
  await page.selectOption("#a-recinto", "manati");
  await page.waitForFunction(() => document.documentElement.dataset.recinto === "manati");
  await page.fill("#a-usuario", "nuevo.est"); await page.fill("#a-clave", "secreta1");
  await page.fill("#a-codigo", "123456"); await page.fill("#a-nombre", "Nuevo Estudiante");
  await page.fill("#a-email", "n@correo.com"); await page.check("#a-instructor");
  await page.click("#a-enviar");
  await page.waitForFunction(() => document.querySelector("main")?.dataset.vista !== "acceso", null, { timeout: 8000 });
  assert.equal(cuerpo.recinto, "manati");
  assert.equal(cuerpo.usuario, "nuevo.est");
  assert.equal(cuerpo.codigo, "123456");
  assert.equal(cuerpo.nombre, "Nuevo Estudiante");
  assert.equal(cuerpo.email, "n@correo.com");
  assert.equal(cuerpo.solicita_instructor, true);
  await ctx.close();
});

await prueba("teléfono: usuario, contraseña y botón se ven en la primera pantalla (con o sin recinto elegido); la elección va tras el formulario", async () => {
  for (const recinto of [null, "manati"]) for (const alto of [667, 812]) {
    const { ctx, page } = await nuevaPagina(movil(375, alto));
    await recordar(page, recinto);
    await irAEntrada(page);
    await page.waitForTimeout(700);
    const donde = `${recinto || "primera visita"} ${alto}px`;
    for (const id of ["#a-usuario", "#a-clave", "#a-enviar"]) {
      const b = await page.locator(id).boundingBox();
      assert.ok(b.y + b.height <= alto, `${donde}: ${id} debe verse sin desplazar (termina en ${Math.round(b.y + b.height)})`);
    }
    const enviar = await page.locator("#a-enviar").boundingBox(), tarjetas = await page.locator(".elegir").boundingBox();
    assert.ok(tarjetas.y >= enviar.y + enviar.height, `${donde}: las tarjetas de recinto van después del formulario`);
    assert.equal(await page.locator(".elegir").isVisible(), true, "la elección sigue a la mano");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 375);
    await ctx.close();
  }
  // con recinto elegido: el chip abre la hoja de abajo
  const { ctx: c2, page: p2 } = await nuevaPagina(movil(375, 760));
  await recordar(p2, "manati");
  await irAEntrada(p2);
  assert.equal(await p2.getAttribute(".e-tope .rec-btn", "aria-label"), "Recinto: Manatí, cambiar");
  await p2.click(".e-tope .rec-btn");
  await p2.waitForSelector("dialog.hoja-rec[open]");
  await p2.click('dialog [data-ir-recinto="sanjuan"]');
  await p2.waitForFunction(() => document.documentElement.dataset.recinto === "sanjuan");
  await c2.close();
});

await prueba("primera visita: ninguna tarjeta dice «Tu recinto» ni el titular da por hecho ITPR; tocar la tarjeta del recinto que ya se ve también cuenta como elegir", async () => {
  const { ctx, page } = await nuevaPagina(movil(375, 812));
  await recordar(page, null);
  await irAEntrada(page);
  assert.equal(await page.locator('.tile-rec[aria-pressed="true"]').count(), 0, "ninguna tarjeta marcada antes de elegir");
  assert.equal(await page.locator(".tile-rec .tuyo:visible").count(), 0);
  assert.equal(await page.evaluate(() => localStorage.getItem("bitacora:recinto")), null);
  await page.setViewportSize({ width: 1280, height: 900 });
  assert.match(await page.locator(".e-lead").innerText(), /Elige tu recinto para empezar/);
  assert.doesNotMatch(await page.locator(".e-lead").innerText(), /es tu casa/);
  await page.click('.tile-rec[data-recinto="itpr"]');                // ITPR ya es el que se ve: igual queda elegido
  await page.waitForFunction(() => document.querySelector('.tile-rec[data-recinto="itpr"]').getAttribute("aria-pressed") === "true");
  assert.equal(await page.evaluate(() => localStorage.getItem("bitacora:recinto")), "itpr");
  assert.match(await page.locator(".e-lead").innerText(), /es tu casa/);
  await ctx.close();
  const { ctx: c2, page: p2 } = await nuevaPagina(movil(375, 760));
  await recordar(p2, null);
  await irAEntrada(p2);
  await p2.click('.tile-rec[data-recinto="sanjuan"]');
  await p2.waitForFunction(() => document.documentElement.dataset.recinto === "sanjuan");
  assert.equal(await p2.evaluate(() => localStorage.getItem("bitacora:recinto")), "sanjuan");
  await c2.close();
});

await prueba("entrar con usuario y clave funciona; un usuario inválido muestra el aviso", async () => {
  const { ctx, page, errores } = await nuevaPagina();
  await irAEntrada(page);
  await page.fill("#a-usuario", "xx"); await page.fill("#a-clave", "secreta1");
  await page.click("#a-enviar");
  assert.match(await page.textContent("#aviso"), /entre 3 y 32 caracteres/);
  await page.fill("#a-usuario", "luis");
  await page.click("#a-enviar");
  await page.waitForSelector("main[data-vista=inicio]");
  assert.deepEqual(errores, []);
  await ctx.close();
});

await prueba("Mis hojas: cada fila dice su estado con forma, glifo y palabra; el incompleto marca lo que falta; la nota va como 91/100", async () => {
  const { ctx, page, errores } = await nuevaPagina();
  await conHojas(ctx, HOJAS);
  await aMisHojas(page);
  assert.equal(await page.locator(".tarjeta").count(), 6);
  assert.equal(await page.locator(".pill, .exclama, .fila-falta").count(), 0, "ya no se usan .pill, .exclama ni .fila-falta");
  const filas = await page.$$eval(".tarjeta", fs => fs.map(f => ({ v: f.dataset.v, chip: f.querySelector(".estado")?.textContent.trim(), glifo: f.querySelector(".estado use")?.getAttribute("href"), texto: f.textContent.replace(/\s+/g, " ") })));
  assert.deepEqual(filas.map(f => f.v), ["apto", "obs", "no", "inc", "bor", "apto"]);
  assert.deepEqual(filas.map(f => f.chip), ["Apto", "Apto con observaciones", "No apto", "Incompleto", "Borrador", "Apto"]);
  assert.deepEqual(filas.map(f => f.glifo), ["#g-apto", "#g-obs", "#g-no", "#g-inc", "#g-bor", "#g-apto"]);
  assert.match(filas[3].texto, /Falta: .*(hallazgos|sistema)/);
  assert.match(filas[0].texto, /91\s*\/100/);
  assert.match(filas[1].texto, /Sin calificar/);
  assert.equal(await page.locator('.tarjeta[data-v="inc"] .estado').evaluate(e => getComputedStyle(e).borderTopStyle), "solid", "el incompleto lleva contorno");
  assert.ok(await page.locator('.tarjeta[data-v="inc"]').evaluate(e => getComputedStyle(e).backgroundColor !== getComputedStyle(document.querySelector('.tarjeta[data-v="apto"]')).backgroundColor), "el incompleto se tiñe");
  assert.match(await page.textContent("#h-hojas"), /Mis\s*hojas/i);
  assert.equal(await page.locator("#b-nuevo").isVisible(), true);
  assert.deepEqual(errores, []);
  await ctx.close();
});

await prueba("Mis hojas: los filtros esconden filas y la cuenta coincide; Nuevo diagnóstico abre el editor", async () => {
  const { ctx, page } = await nuevaPagina();
  await conHojas(ctx, HOJAS);
  await aMisHojas(page);
  const visibles = () => page.locator(".tarjeta:visible").count();
  assert.equal(await visibles(), 6);
  await page.click('#filtros-hojas [data-f="inc"]');
  assert.equal(await visibles(), 1);
  assert.equal(await page.getAttribute('#filtros-hojas [data-f="inc"]', "aria-pressed"), "true");
  await page.click('#filtros-hojas [data-f="bor"]');
  assert.equal(await visibles(), 1);
  await page.click('#filtros-hojas [data-f="ent"]');
  assert.equal(await visibles(), 4);
  await page.click('#filtros-hojas [data-f="todas"]');
  assert.equal(await visibles(), 6);
  await page.click("#b-nuevo");
  await page.waitForSelector("main[data-vista=editor]");
  await ctx.close();
});

await prueba("Mis hojas vacía: mensaje y botón para empezar la primera", async () => {
  const { ctx, page } = await nuevaPagina();
  await conHojas(ctx, []);
  await aMisHojas(page);
  assert.equal(await page.locator(".tarjeta").count(), 0);
  assert.match(await page.textContent(".vacio"), /Todavía no has registrado/);
  await page.click("#b-nuevo-2");
  await page.waitForSelector("main[data-vista=editor]");
  await ctx.close();
});

await prueba("la solicitud de instructor usa el tono de información (nunca observación) y el instructor ve sus botones", async () => {
  const { ctx, page } = await nuevaPagina();
  await conHojas(ctx, HOJAS);
  await aMisHojas(page, "ana");                                      // Ana es estudiante y pidió ser instructor
  const aviso = page.locator(".aviso-info");
  assert.equal(await aviso.count(), 1);
  assert.match(await aviso.textContent(), /espera la aprobación/);
  assert.equal(await aviso.locator("use").getAttribute("href"), "#g-info");
  assert.equal(await aviso.locator('[data-v="obs"], .estado').count(), 0, "no es un veredicto");
  assert.equal(await page.locator("#b-codigo").count(), 0, "un estudiante no ve el código de clase");
  await ctx.close();
  const p = await nuevaPagina();
  await conHojas(p.ctx, HOJAS);
  await aMisHojas(p.page, "prof");
  assert.equal(await p.page.locator("#b-codigo").isVisible(), true);
  assert.equal(await p.page.locator("#b-instructor").isVisible(), true);
  assert.equal(await p.page.locator(".aviso-info").count(), 0);
  await p.ctx.close();
});

await prueba("correo para avisos: se guarda en el perfil y avisa; texto de usuario escapado (sin XSS)", async () => {
  const { ctx, page, errores } = await nuevaPagina();
  await conHojas(ctx, HOJAS);
  let parche = null;
  await ctx.route("**/rest/v1/perfiles**", r => { if (r.request().method() === "PATCH") parche = JSON.parse(r.request().postData() || "{}"); return r.fallback(); });
  await aMisHojas(page);
  assert.equal(await page.evaluate(() => window.__xss), undefined, "no debe ejecutarse la marca con HTML");
  assert.equal(await page.locator(".tarjeta img").count(), 0, "el HTML del equipo se muestra como texto");
  assert.match(await page.locator(".tarjeta").last().innerText(), /<img src=x/);
  assert.equal(await page.inputValue("#p-email"), "luis@correo.com");
  await page.fill("#p-email", "nuevo@correo.com");
  await page.click('#f-correo button[type="submit"]');
  await page.waitForSelector("#aviso.exito");
  assert.match(await page.textContent("#aviso"), /Correo guardado/);
  assert.equal(parche?.email, "nuevo@correo.com");
  assert.deepEqual(errores, []);
  await ctx.close();
});

await prueba("Mis hojas se ve en los 3 recintos y los 2 modos sin errores", async () => {
  for (const r of RECINTOS) for (const m of MODOS) {
    const { ctx, page, errores } = await nuevaPagina();
    await conHojas(ctx, HOJAS);
    await recordar(page, r, m);
    await aMisHojas(page);
    assert.equal(await page.$eval("html", h => h.dataset.recinto), r);
    assert.equal(await page.locator(".tarjeta").count(), 6);
    assert.deepEqual(errores, [], `${r}/${m}`);
    await ctx.close();
  }
});

await terminar();
