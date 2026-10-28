// Barrido de capturas de todo el flujo: entrada -> registro -> tablero del taller -> informes -> Gente -> código QR
// -> hoja ajena, y del estudiante: su dashboard -> Mis hojas -> hoja nueva -> reporte, en 3 recintos x claro/oscuro x escritorio/teléfono.
//   node pruebas/barrido.mjs                        todo, a .diseno/integracion/shots/
//   RECINTOS=manati MODOS=oscuro ANCHOS=390 node pruebas/barrido.mjs entrada editor
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { nuevaPagina, navegador } from "./arnes.mjs";
import { PANTALLAS, abrirPantalla } from "./pantallas.mjs";
import { recorrer } from "./auditoria-marcas.mjs";

const SALIDA = process.env.SALIDA || join(import.meta.dirname, "..", ".diseno", "integracion", "shots");
mkdirSync(SALIDA, { recursive: true });
const pantallas = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(PANTALLAS);
const recintos = process.env.RECINTOS?.split(",") || ["itpr", "sanjuan", "manati"];
const modos = process.env.MODOS?.split(",") || ["claro", "oscuro"];
const anchos = process.env.ANCHOS?.split(",").map(Number) || [1280, 390];
let n = 0, errores = 0;

for (const pantalla of pantallas) for (const recinto of recintos) for (const modo of modos) for (const ancho of anchos) {
  const movil = ancho < 500;
  const { ctx, page, errores: errs } = await nuevaPagina({ viewport: { width: ancho, height: movil ? 800 : 800 }, ...(movil ? { isMobile: true, hasTouch: true } : {}) });
  try {
    await abrirPantalla(page, pantalla, { recinto, modo });
    await recorrer(page, 900);
    await page.screenshot({ path: join(SALIDA, `${pantalla}-${recinto}-${modo}-${ancho}.png`), fullPage: true });
    n++;
    if (errs.length) { errores++; console.log("  ERROR de consola", pantalla, recinto, modo, ancho, errs[0]); }
  } catch (e) { errores++; console.log("  FALLA", pantalla, recinto, modo, ancho, e.message.split("\n")[0]); }
  await ctx.close();
}
console.log(`${n} capturas en ${SALIDA}, ${errores} problemas.`);
await navegador.close();
process.exit(errores ? 1 : 0);
