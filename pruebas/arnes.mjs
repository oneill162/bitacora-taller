// Arnés común de las pruebas de interfaz con Playwright: el servidor de docs/, un Supabase de mentira
// (se intercepta con page.route), perfiles / equipos / hojas de ejemplo y las funciones de ayuda.
//
//   npm install --no-save --no-package-lock playwright   (una vez, sin tocar el repo)
//   node pruebas/ui.mjs        (o todas: node pruebas/todo.mjs)
//
// Usa Edge o Chrome ya instalados (no baja navegadores). Las capturas van a pruebas/capturas/ (ignorada por git).
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { URL_APP } from "./servidor.mjs";

export { URL_APP };
export const CAP = join(import.meta.dirname, "capturas");
mkdirSync(CAP, { recursive: true });

const b64 = o => Buffer.from(JSON.stringify(o)).toString("base64url");
const jwt = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: "i1", role: "authenticated", exp: 4102444800 })}.firma`;
let usuario = { id: "i1", aud: "authenticated", role: "authenticated", email: "prof@taller.local",
                app_metadata: {}, user_metadata: {}, created_at: "2026-09-01T00:00:00Z" };
const sesion = () => ({ access_token: jwt, token_type: "bearer", expires_in: 3600,
                        expires_at: 4102444800, refresh_token: "r", user: usuario });

// recinto: "" = sin elegir (la app deja el que el equipo ya tenga, ITPR si no hay)
export const PERFILES = [
  { id: "i1", usuario: "prof", nombre: "Profe Demo", grupo: "TESI 2", escuela: "Plantel", rol: "instructor",
    es_superusuario: true, solicita_instructor: false, email: "prof@correo.com", recinto: "sanjuan" },
  { id: "e1", usuario: "ana", nombre: "Ana Rivera", grupo: "TESI 2", rol: "estudiante", email: "", solicita_instructor: true, recinto: "manati" },
  { id: "e2", usuario: "luis", nombre: "Luis Díaz", grupo: "TESI 2", rol: "estudiante", email: "luis@correo.com", solicita_instructor: false, recinto: "" },
  { id: "e3", usuario: "guille", nombre: "Guillermina Maldonado", grupo: "TESI 2", rol: "estudiante", email: "", solicita_instructor: false, recinto: "itpr" }
];
export const EQUIPOS = [
  { id: "q1", serial: "ABC1234", marca: "HP", modelo: "ProBook", tipo: "", inventario: "INV-1", ubicacion: "Salón 204", creado_por: "e1" },
  { id: "q2", serial: "XYZ99", marca: "", modelo: "", tipo: "", inventario: "", ubicacion: "", creado_por: "e2" }
];
export const HOY = new Date().toISOString().slice(0, 10);
const conteo = { ok: 30, obs: 4, falla: 2, na: 2, sin: 2 };
export const DIAGS = [
  { id: "d1", autor_id: "e1", equipo_id: "q1", orden: "DX-1", fecha: HOY, estado: "entregado", veredicto: "apto",
    conteo: { ok: 40, obs: 0, falla: 0, na: 0, sin: 0 }, sistema: "Windows 11", hallazgos: "Todo bien", nota: 95,
    comentario: "Muy buen trabajo", actualizado_en: "2026-09-28T15:00:00Z", equipos: EQUIPOS[0] },
  { id: "d2", autor_id: "e2", equipo_id: "q2", orden: "DX-2", fecha: HOY, estado: "entregado", veredicto: "obs",
    conteo, sistema: "", hallazgos: "", nota: null, actualizado_en: "2026-09-28T16:00:00Z", equipos: EQUIPOS[1] }
];

// Lo que la app le escribió a Supabase (PATCH / POST), para comprobar que el recinto se guarda en el perfil.
export const escrituras = [];

export async function simularSupabase(ctx) {
  // Lo que la app le PATCHea a un perfil (el recinto, p. ej.) vive solo en este contexto: PERFILES queda como lo dejó la prueba
  // y una corrida no contamina a la siguiente.
  const parches = new Map();
  const perfiles = () => PERFILES.map(p => ({ ...p, ...parches.get(p.id) }));
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
      const p = perfiles().find(x => x.usuario === quien) || PERFILES[0];
      usuario = { ...usuario, id: p.id, email: `${p.usuario}@taller.local` };
      return json(sesion());
    }
    if (u.pathname.includes("/auth/v1/user")) return json(usuario);
    if (u.pathname.includes("/auth/v1/logout")) return json({});
    if (u.pathname.includes("/functions/v1/")) return json({ ok: true });
    const tabla = u.pathname.split("/rest/v1/")[1];
    const yoPerfil = perfiles().find(x => x.id === usuario.id);
    if (route.request().method() === "PATCH") {
      const cambios = JSON.parse(route.request().postData() || "{}");
      escrituras.push({ tabla, cambios, filtro: u.search });
      // la columna es text not null default '' con check (''|itpr|sanjuan|manati): Postgres rechaza null y cualquier otro valor
      if (tabla === "perfiles" && "recinto" in cambios && !["", "itpr", "sanjuan", "manati"].includes(cambios.recinto))
        return json({ code: cambios.recinto == null ? "23502" : "23514", message: cambios.recinto == null
          ? 'null value in column "recinto" of relation "perfiles" violates not-null constraint'
          : 'new row for relation "perfiles" violates check constraint' }, 400);
      if (tabla === "perfiles") {
        const id = u.searchParams.get("id")?.replace("eq.", "");
        if (PERFILES.some(x => x.id === id)) parches.set(id, { ...parches.get(id), ...cambios });
      }
      return json([]);
    }
    // como RLS: el estudiante solo ve sus hojas
    const diagsVisibles = yoPerfil?.rol === "instructor" ? DIAGS : DIAGS.filter(d => d.autor_id === usuario.id);
    const datos = { perfiles: perfiles(), equipos: EQUIPOS, diagnosticos: diagsVisibles, puntos: [] }[tabla];
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

export const navegador = await chromium.launch({ channel: "msedge" }).catch(() => chromium.launch({ channel: "chrome" }));
export let pasaron = 0;
export const prueba = async (nombre, fn) => {
  try { await fn(); pasaron++; console.log("  ok  ", nombre); }
  catch (e) { console.log("  FALLA", nombre, "\n       ", e.message.split("\n")[0]); process.exitCode = 1; }
};
// Cierra el navegador y da el resumen; el código de salida lo fija `prueba`.
export async function terminar() {
  await navegador.close();
  console.log(`\n${pasaron} pruebas pasaron${process.exitCode ? ", hubo fallas" : ""}.`);
  process.exit(process.exitCode || 0);
}

export async function nuevaPagina(opts = {}) {
  const ctx = await navegador.newContext({ serviceWorkers: "block", viewport: { width: 1100, height: 800 }, ...opts });
  await simularSupabase(ctx);
  const page = await ctx.newPage();
  const errores = [];
  page.on("pageerror", e => errores.push(e.message));
  if (process.env.DEPURAR) { page.on("console", m => console.log("  [consola]", m.text())); page.on("requestfailed", r => console.log("  [falló]", r.url(), r.failure()?.errorText)); page.on("response", r => r.url().includes("supabase.co") && console.log("  [resp]", r.status(), r.url().slice(0, 110))); }
  page.on("console", m => { if (m.type() === "error" && !/ERR_FAILED|fonts/.test(m.text())) errores.push(m.text()); });
  return { ctx, page, errores };
}

// Entra con un usuario de ejemplo. Los botones de navegación tienen dos copias (barra de arriba y de abajo):
// en las pruebas se usa el selector con :visible.
export const entrar = async (page, quien = "prof") => {
  await page.goto(URL_APP);
  await page.fill("#a-usuario", quien);
  await page.fill("#a-clave", "secreta1");
  await page.click("#a-enviar");
  await page.waitForSelector("main[data-vista=inicio]", { timeout: 8000 }).catch(async e => {
    console.log("DEBUG:", await page.evaluate(() => [document.querySelector("#aviso")?.textContent,
      document.querySelector("h1")?.textContent, document.querySelector("#a-enviar")?.disabled].join(" | ")));
    throw e; });
};
// Sin desborde horizontal: ni el ancho del documento ni un scroll real hacia la derecha (scrollTo no puede mover nada).
export const sinDesborde = page => page.evaluate(() => {
  window.scrollTo(200, 0);
  const movido = window.scrollX;
  window.scrollTo(0, 0);
  return document.documentElement.scrollWidth <= window.innerWidth + 1 && movido === 0;
});
