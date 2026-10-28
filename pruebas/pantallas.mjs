// Cómo llegar a cada pantalla de la app con el Supabase de mentira de arnes.mjs.
// Lo usan las auditorías que recorren todas las pantallas (marcas.mjs, ui.mjs, barrido.mjs).
import { URL_APP, PERFILES, entrar } from "./arnes.mjs";

const nav = k => `[data-nav="${k}"]:visible`;
const taller = async (page, pestana) => {
  await page.click(nav("instructor"));
  await page.waitForSelector("#p-gente");
  await page.waitForSelector(".t-fila");
  if (pestana) await page.click("#p-" + pestana);
};

// quien: con qué usuario se entra (null = sin sesión). ir(page): deja la pantalla lista.
export const PANTALLAS = {
  entrada: { quien: null, ir: async page => { await page.goto(URL_APP); await page.waitForSelector("#f-acceso"); } },
  registro: { quien: null, ir: async page => { await page.goto(URL_APP); await page.click("#m-crear"); await page.waitForSelector("#extra:not([hidden])"); } },
  inicio: { quien: "prof", ir: async () => {} },
  "inicio-estudiante": { quien: "ana", ir: async () => {} },
  panel: { quien: "ana", ir: async page => { await page.click(nav("panel")); await page.waitForSelector(".tarjeta"); } },
  tablero: { quien: "prof", ir: page => taller(page) },
  informes: { quien: "prof", ir: async page => { await taller(page, "informes"); await page.click('[data-informe="incompletos"]'); await page.waitForSelector(".grupo-falta"); } },
  gente: { quien: "prof", ir: async page => { await taller(page, "gente"); await page.waitForSelector("#f-nuevo-est"); } },
  codigo: { quien: "prof", ir: async page => { await page.evaluate(async () => (await import("./router.js")).irA("codigo")); await page.waitForSelector("#qr svg"); } },
  editor: { quien: "ana", ir: async page => { await page.click("#d-nuevo"); await page.waitForSelector('main[data-vista="editor"]'); await page.waitForSelector("[data-punto]"); } },
  "reporte-ajena": { quien: "prof", ir: async page => { await taller(page); await page.locator(".t-fila[data-ajena]").first().click(); await page.waitForSelector('main[data-vista="reporte"]'); } },
  reporte: { quien: "ana", ir: async page => { await page.click(nav("panel")); await page.waitForSelector("[data-abrir]"); await page.locator("[data-abrir]").first().click(); await page.waitForSelector('main[data-vista="reporte"]'); } }
};

// Abre `pantalla` con el recinto y el modo dados. El recinto del perfil manda sobre el del equipo, así que se pone en los dos.
export async function abrirPantalla(page, pantalla, { recinto = "sanjuan", modo = "claro" } = {}) {
  const p = PANTALLAS[pantalla];
  await page.addInitScript(([r, m]) => { try { localStorage.setItem("bitacora:recinto", r); localStorage.setItem("bitacora:modo", m); } catch (_) {} }, [recinto, modo]);
  if (p.quien) {
    PERFILES.find(x => x.usuario === p.quien).recinto = recinto;
    await entrar(page, p.quien);
  }
  await p.ir(page);
  await page.waitForTimeout(250);
}
