// Auditoría de marcas oficiales en TODAS las pantallas (reglas en pruebas/auditoria-marcas.mjs y docs/img/LEEME.md).
//   node pruebas/marcas.mjs                 matriz completa: pantallas x 3 recintos x 2 modos x (360, 375, 390, 1280)
//   node pruebas/marcas.mjs entrada editor  solo esas pantallas
//   ANCHOS=375,1280 node pruebas/marcas.mjs  otros anchos
import { nuevaPagina, navegador } from "./arnes.mjs";
import { PANTALLAS, abrirPantalla } from "./pantallas.mjs";
import { auditarMarcas } from "./auditoria-marcas.mjs";

const pantallas = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(PANTALLAS);
const anchos = process.env.ANCHOS?.split(",").map(Number) || [360, 375, 390, 1280];
let revisadas = 0, malas = 0;

for (const pantalla of pantallas) for (const modo of ["claro", "oscuro"]) for (const recinto of ["itpr", "sanjuan", "manati"]) for (const ancho of anchos) {
  const movil = ancho < 500;
  const { ctx, page } = await nuevaPagina({ viewport: { width: ancho, height: movil ? 800 : 900 }, ...(movil ? { isMobile: true, hasTouch: true } : {}) });
  try {
    await abrirPantalla(page, pantalla, { recinto, modo });
    const r = await auditarMarcas(page, `${pantalla}/${recinto}/${modo}/${ancho}`);
    revisadas += r.revisadas; malas += r.fallas.length;
    r.fallas.forEach(f => console.log("  FALLA", f));
  } catch (e) { malas++; console.log("  FALLA", `${pantalla}/${recinto}/${modo}/${ancho}`, e.message.split("\n")[0]); }
  await ctx.close();
}
// La llegada del escudo tras cambiar de recinto (html.llega) traslada y escala la placa durante ~0,5 s. Se congela cada animación en varios
// puntos y el escudo tiene que quedar dentro del ancestro que recorta (el héroe): el resto de la auditoría solo mira marcas en reposo.
let llegadas = 0;
for (const pantalla of ["entrada", "inicio"]) for (const recinto of ["itpr", "sanjuan", "manati"]) for (const ancho of [390, 1280]) {
  if (process.argv.slice(2).length && !process.argv.slice(2).includes(pantalla)) continue;
  const movil = ancho < 500;
  const { ctx, page } = await nuevaPagina({ viewport: { width: ancho, height: movil ? 800 : 900 }, ...(movil ? { isMobile: true, hasTouch: true } : {}) });
  try {
    await abrirPantalla(page, pantalla, { recinto, modo: "claro" });
    await page.waitForTimeout(1200);
    const r = await page.evaluate(async () => {
      const root = document.documentElement;
      root.classList.remove("llega"); void root.offsetWidth; root.classList.add("llega");
      const anims = document.getAnimations().filter(a => /^llega-/.test(a.animationName || ""));
      const sale = [];
      for (const a of anims) {
        const dur = a.effect.getComputedTiming().duration, wrap = a.effect.target;
        if (a.effect.getKeyframes().some(k => "opacity" in k)) sale.push(`${a.animationName} anima opacity`);
        let clip = wrap.parentElement;
        while (clip && clip !== document.body && getComputedStyle(clip).overflow === "visible") clip = clip.parentElement;
        for (const p of [0, .1, .2, .35, .6, 1]) {
          a.pause(); a.currentTime = p * dur;
          await new Promise(f => requestAnimationFrame(f));
          const c = clip.getBoundingClientRect();
          // jamás semitransparente: la marca, su placa y todo hasta el héroe tienen opacidad 1 en cada punto de la llegada
          for (let e = wrap.querySelector("img"); e && e !== wrap.parentElement; e = e.parentElement) {
            const o = +getComputedStyle(e).opacity;
            if (o < 1) sale.push(`${a.animationName} al ${p * 100}%: ${e.className || e.tagName} con opacidad ${o.toFixed(2)}`);
          }
          for (const img of wrap.querySelectorAll("img")) {
            const b = img.getBoundingClientRect();
            if (!b.width) continue;
            const fuera = Math.max(c.left - b.left, b.right - c.right, c.top - b.top, b.bottom - c.bottom);
            if (fuera > .5) sale.push(`${a.animationName} al ${p * 100}%: ${img.className} sale ${fuera.toFixed(1)}px`);
          }
        }
        a.cancel();
      }
      root.classList.remove("llega");
      return { n: anims.length, sale };
    });
    llegadas += r.n;
    r.sale.forEach(f => { malas++; console.log("  FALLA llegada", `${pantalla}/${recinto}/${ancho}`, f); });
  } catch (e) { malas++; console.log("  FALLA llegada", `${pantalla}/${recinto}/${ancho}`, e.message.split("\n")[0]); }
  await ctx.close();
}
if (!llegadas && !process.argv.slice(2).length) { malas++; console.log("  FALLA llegada: no se encontró ninguna animación llega-* que revisar"); }
console.log(`${llegadas} llegadas del escudo revisadas.`);
console.log(`${revisadas} marcas revisadas en ${pantallas.length} pantallas, ${malas} con fallas.`);
await navegador.close();
process.exit(malas ? 1 : 0);
