// Pruebas de la interfaz con Playwright: que el diseño cargue sin errores, que el
// movimiento haga lo que se diseñó (y se apague con "reducir movimiento"), que
// nada se salga de la pantalla en un teléfono y que las vistas de estudiante e
// instructor abran. Supabase es de mentira: se intercepta con page.route.
//
//   npm install --no-save --no-package-lock playwright   (una vez, sin tocar el repo)
//   node pruebas/ui.mjs
//
// Usa Edge o Chrome ya instalados (no baja navegadores). Deja capturas en
// pruebas/capturas/ (ignorada por git).
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import "./servidor.mjs";

const URL_APP = "http://127.0.0.1:8731/";
const CAP = join(import.meta.dirname, "capturas");
mkdirSync(CAP, { recursive: true });

const b64 = o => Buffer.from(JSON.stringify(o)).toString("base64url");
const jwt = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: "i1", role: "authenticated", exp: 4102444800 })}.firma`;
let usuario = { id: "i1", aud: "authenticated", role: "authenticated", email: "prof@taller.local",
                  app_metadata: {}, user_metadata: {}, created_at: "2026-09-01T00:00:00Z" };
const sesion = () => ({ access_token: jwt, token_type: "bearer", expires_in: 3600,
                 expires_at: 4102444800, refresh_token: "r", user: usuario });

const PERFILES = [
  { id: "i1", usuario: "prof", nombre: "Profe Demo", grupo: "TESI 2", escuela: "Plantel", rol: "instructor",
    es_superusuario: true, solicita_instructor: false, email: "prof@correo.com" },
  { id: "e1", usuario: "ana", nombre: "Ana Rivera", grupo: "TESI 2", rol: "estudiante", email: "", solicita_instructor: true },
  { id: "e2", usuario: "luis", nombre: "Luis Díaz", grupo: "TESI 2", rol: "estudiante", email: "luis@correo.com", solicita_instructor: false }
];
const EQUIPOS = [
  { id: "q1", serial: "ABC1234", marca: "HP", modelo: "ProBook", tipo: "", inventario: "INV-1", ubicacion: "Salón 204", creado_por: "e1" },
  { id: "q2", serial: "XYZ99", marca: "", modelo: "", tipo: "", inventario: "", ubicacion: "", creado_por: "e2" }
];
const HOY = new Date().toISOString().slice(0, 10);
const conteo = { ok: 30, obs: 4, falla: 2, na: 2, sin: 2 };
const DIAGS = [
  { id: "d1", autor_id: "e1", equipo_id: "q1", orden: "DX-1", fecha: HOY, estado: "entregado", veredicto: "apto",
    conteo: { ok: 40, obs: 0, falla: 0, na: 0, sin: 0 }, sistema: "Windows 11", hallazgos: "Todo bien", nota: 95,
    comentario: "Muy buen trabajo", actualizado_en: "2026-09-28T15:00:00Z", equipos: EQUIPOS[0] },
  { id: "d2", autor_id: "e2", equipo_id: "q2", orden: "DX-2", fecha: HOY, estado: "entregado", veredicto: "obs",
    conteo, sistema: "", hallazgos: "", nota: null, actualizado_en: "2026-09-28T16:00:00Z", equipos: EQUIPOS[1] }
];

async function simularSupabase(ctx) {
  await ctx.route("https://fonts.googleapis.com/**", r => r.fulfill({ contentType: "text/css", body: "" }));
  await ctx.route("https://fonts.gstatic.com/**", r => r.abort());
  await ctx.route("https://glwinbslxgurmzyvttyo.supabase.co/**", async route => {
    const u = new URL(route.request().url());
    const json = (body, status = 200) => route.fulfill({
      status, contentType: "application/json", headers: { "access-control-allow-origin": "*" },
      body: JSON.stringify(body) });
    if (route.request().method() === "OPTIONS")
      return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*",
        "access-control-allow-headers": route.request().headers()["access-control-request-headers"] || "*",
        "access-control-allow-methods": "*" } });
    if (u.pathname.includes("/auth/v1/health")) return json({});
    if (u.pathname.includes("/auth/v1/token")) {
      const quien = JSON.parse(route.request().postData() || "{}").email?.split("@")[0];
      const p = PERFILES.find(x => x.usuario === quien) || PERFILES[0];
      usuario = { ...usuario, id: p.id, email: `${p.usuario}@taller.local` };
      return json(sesion());
    }
    if (u.pathname.includes("/auth/v1/user")) return json(usuario);
    if (u.pathname.includes("/auth/v1/logout")) return json({});
    if (u.pathname.includes("/functions/v1/")) return json({ ok: true });
    const tabla = u.pathname.split("/rest/v1/")[1];
    const yoPerfil = PERFILES.find(x => x.id === usuario.id);
    // como RLS: el estudiante solo ve sus hojas
    const diagsVisibles = yoPerfil?.rol === "instructor" ? DIAGS : DIAGS.filter(d => d.autor_id === usuario.id);
    const datos = { perfiles: PERFILES, equipos: EQUIPOS, diagnosticos: diagsVisibles, puntos: [] }[tabla];
    if (!datos) return json([]);
    const objeto = (route.request().headers().accept || "").includes("vnd.pgrst.object");
    const id = u.searchParams.get("id")?.replace("eq.", "");
    if (objeto) return json((id ? datos.find(x => x.id === id) : datos[0]) || null);
    // filtros simples ?columna=eq.valor, como los que manda supabase-js
    const filtrados = datos.filter(x => [...u.searchParams].every(([k, v]) =>
      !v.startsWith("eq.") || !(k in x) || String(x[k]) === v.slice(3)));
    return json(filtrados);
  });
}

const navegador = await chromium.launch({ channel: "msedge" }).catch(() => chromium.launch({ channel: "chrome" }));
let pasaron = 0;
const prueba = async (nombre, fn) => {
  try { await fn(); pasaron++; console.log("  ok  ", nombre); }
  catch (e) { console.log("  FALLA", nombre, "\n       ", e.message.split("\n")[0]); process.exitCode = 1; }
};

async function nuevaPagina(opts = {}) {
  const ctx = await navegador.newContext({ serviceWorkers: "block", viewport: { width: 1100, height: 800 }, ...opts });
  await simularSupabase(ctx);
  const page = await ctx.newPage();
  const errores = [];
  page.on("pageerror", e => errores.push(e.message));
  if (process.env.DEPURAR) { page.on("console", m => console.log("  [consola]", m.text())); page.on("requestfailed", r => console.log("  [falló]", r.url(), r.failure()?.errorText)); page.on("response", r => r.url().includes("supabase.co") && console.log("  [resp]", r.status(), r.url().slice(0, 110))); }
  page.on("console", m => { if (m.type() === "error" && !/ERR_FAILED|fonts/.test(m.text())) errores.push(m.text()); });
  return { ctx, page, errores };
}
const entrar = async (page, quien = "prof") => {
  await page.goto(URL_APP);
  await page.fill("#a-usuario", quien);
  await page.fill("#a-clave", "secreta1");
  await page.click("#a-enviar");
  await page.waitForSelector(".inicio", { timeout: 8000 }).catch(async e => {
    console.log("DEBUG:", await page.evaluate(() => [document.querySelector("#aviso")?.textContent,
      document.querySelector("h1")?.textContent, document.querySelector("#a-enviar")?.disabled].join(" | ")));
    throw e; });
};
const sinDesborde = page => page.evaluate(() =>
  document.documentElement.scrollWidth <= window.innerWidth + 1);

console.log("Interfaz");

await prueba("la entrada carga sin errores y con su movimiento", async () => {
  const { ctx, page, errores } = await nuevaPagina();
  await page.goto(URL_APP);
  await page.waitForSelector("#f-acceso");
  const anim = await page.$eval(".acceso", el => getComputedStyle(el).animationName);
  assert.equal(anim, "entra");
  const fondo = await page.evaluate(() => getComputedStyle(document.body, "::before").animationName);
  assert.equal(fondo, "deriva");
  await page.screenshot({ path: join(CAP, "entrada-claro.png") });
  assert.deepEqual(errores, []);
  await ctx.close();
});

await prueba("botones: sube al pasar el cursor, se hunde al presionar, no usa transition: all", async () => {
  const { ctx, page } = await nuevaPagina();
  await page.goto(URL_APP);
  const btn = page.locator("#a-enviar");
  await btn.waitFor();
  const prop = await btn.evaluate(el => getComputedStyle(el).transitionProperty);
  assert.ok(!/\ball\b/.test(prop), "transition-property: " + prop);
  await btn.hover();
  await page.waitForTimeout(260);
  assert.match(await btn.evaluate(el => getComputedStyle(el).transform), /matrix\(1, 0, 0, 1, 0, -1\)/);
  await page.mouse.down();
  await page.waitForTimeout(160);
  assert.match(await btn.evaluate(el => getComputedStyle(el).transform), /matrix\(0\.97/);
  await page.mouse.up();
  await ctx.close();
});

await prueba("reducir movimiento: sin deriva, sin saltos, el fundido se queda", async () => {
  const { ctx, page } = await nuevaPagina({ reducedMotion: "reduce" });
  await page.goto(URL_APP);
  await page.waitForSelector("#f-acceso");
  assert.equal(await page.evaluate(() => getComputedStyle(document.body, "::before").animationName), "none");
  assert.equal(await page.$eval(".acceso", el => getComputedStyle(el).animationName), "aparece");
  const btn = page.locator("#a-enviar");
  await btn.hover(); await page.waitForTimeout(260);
  assert.equal(await btn.evaluate(el => getComputedStyle(el).transform), "none");
  await ctx.close();
});

await prueba("modo oscuro se ve y no tiene errores", async () => {
  const { ctx, page, errores } = await nuevaPagina({ colorScheme: "dark" });
  await page.goto(URL_APP);
  await page.waitForSelector("#f-acceso");
  await page.waitForTimeout(450);
  await page.screenshot({ path: join(CAP, "entrada-oscuro.png") });
  assert.deepEqual(errores, []);
  await ctx.close();
});

await prueba("teléfono (375px): nada se sale de la pantalla en entrada ni en registro", async () => {
  const { ctx, page } = await nuevaPagina({ viewport: { width: 375, height: 760 }, isMobile: true, hasTouch: true });
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
  await page.click('[data-nav="inicio"]');
  await page.waitForSelector(".kpi");
  await page.click('[data-nav="instructor"]');
  await page.waitForSelector("#p-gente");
  await page.waitForSelector(".fila-t");
  assert.ok(await page.locator(".fila-falta").count() >= 1, "falta marcar en rojo la hoja incompleta");
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
  assert.ok(await page.locator(".exclama").count() >= 1, "falta el signo de exclamación");
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(CAP, "incompletos.png"), fullPage: true });

  await page.click('[data-informe="estudiante"]');
  await page.waitForSelector(".g-barra i");
  assert.equal(await page.$eval(".g-barra i", el => getComputedStyle(el).animationName), "crece");
  assert.deepEqual(errores, []);
  await ctx.close();
});

await prueba("instructor en teléfono: tablero, Gente e informes sin desborde de página", async () => {
  const { ctx, page } = await nuevaPagina({ viewport: { width: 375, height: 760 }, isMobile: true, hasTouch: true });
  await entrar(page);
  await page.click('[data-nav="instructor"]');
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
  await page.click('[data-nav="panel"]');
  await page.waitForSelector(".tarjeta");
  await page.click('[data-nav="inicio"]');
  await page.waitForSelector(".kpi");
  assert.deepEqual(errores, []);
  await ctx.close();
});

await prueba("estudiante en teléfono: dashboard sin desborde y con navegación a un toque", async () => {
  const { ctx, page } = await nuevaPagina({ viewport: { width: 375, height: 760 }, isMobile: true, hasTouch: true });
  await entrar(page, "luis");
  await page.waitForSelector(".kpi");
  await page.waitForTimeout(900);
  assert.ok(await sinDesborde(page), "desborde en el dashboard");
  assert.ok(await page.locator(".alerta-panel").count() === 1, "Luis tiene una hoja incompleta y debe verse");
  await page.screenshot({ path: join(CAP, "dashboard-movil.png"), fullPage: true });
  await ctx.close();
});

await navegador.close();
console.log(`\n${pasaron} pruebas pasaron${process.exitCode ? ", hubo fallas" : ""}.`);
process.exit(process.exitCode || 0);
