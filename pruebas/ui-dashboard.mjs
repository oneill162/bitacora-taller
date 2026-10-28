// Pruebas del dashboard (inicio del estudiante y del instructor): docs/dashboard.js, graficas.js, v-dashboard.css.
//
//   node pruebas/ui-dashboard.mjs              las pruebas
//   node pruebas/ui-dashboard.mjs --capturas   además deja capturas (3 recintos x claro/oscuro x escritorio/teléfono)
//                                              en .diseno/area-dashboard/shots/ con datos de muestra más ricos
//
// Usa el arnés (Supabase de mentira, perfiles, hojas y un servidor de docs/ en un puerto libre).
import assert from "node:assert/strict";
import { join } from "node:path";

const { URL_APP, PERFILES, EQUIPOS, DIAGS, nuevaPagina, prueba, terminar } = await import("./arnes.mjs");

const SHOTS = join(import.meta.dirname, "..", ".diseno", "area-dashboard", "shots");
const CAPTURAS = process.argv.includes("--capturas");
const RECINTOS = ["itpr", "sanjuan", "manati"], MODOS = ["claro", "oscuro"];

/* ---------------- ayudas ---------------- */
async function entrar(page, quien) {
  await page.goto(URL_APP);
  await page.fill("#a-usuario", quien);
  await page.fill("#a-clave", "secreta1");
  await page.click("#a-enviar");
  await page.waitForSelector("main[data-vista=inicio]", { timeout: 8000 });
  await page.waitForSelector(".kpis", { timeout: 8000 });
}
// Un recinto o un modo es un atributo en <html>: no se vuelve a pintar nada. aplicarRecinto (el mismo módulo que usa la app)
// pone además los textos, el aria y el nombre del pie.
const poner = (page, recinto, modo) => page.evaluate(async ([r, m]) => {
  document.documentElement.dataset.modo = m;
  (await import("./campus.js")).aplicarRecinto(r, { recordar: false });
}, [recinto, modo]);
const recorrer = async page => {
  await page.evaluate(async () => {
    const h = document.documentElement.scrollHeight;
    for (let y = 0; y < h; y += 250) { scrollTo(0, y); await new Promise(f => setTimeout(f, 70)); }
    scrollTo(0, 0);
  });
  await page.waitForTimeout(1500);
};
async function abrir(quien, { ancho = 1280, recinto = "sanjuan", modo = "claro", reducir = false, humano = false } = {}) {
  const movil = ancho < 500;
  const { ctx, page, errores } = await nuevaPagina({
    viewport: { width: ancho, height: movil ? 800 : 900 }, ...(movil ? { isMobile: true, hasTouch: true } : {}),
    ...(reducir ? { reducedMotion: "reduce" } : {}) });
  // humano: la cifra que sube se salta bajo automatización (navigator.webdriver); aquí se prueba como la vería una persona
  if (humano) await page.addInitScript(() => Object.defineProperty(navigator, "webdriver", { get: () => false }));
  await entrar(page, quien);
  await poner(page, recinto, modo);
  return { ctx, page, errores };
}
const sinDesborde = page => page.evaluate(() => {
  window.scrollTo(300, 0);
  const movido = window.scrollX;
  window.scrollTo(0, 0);
  return { ok: document.documentElement.scrollWidth <= window.innerWidth + 1 && movido === 0,
           ancho: document.documentElement.scrollWidth, ventana: window.innerWidth, movido };
});
// Dos capturas de la misma marca: iguales salvo el ruido del suavizado (un clip-path que sí recorta cambia muchos píxeles por mucho)
const iguales = (page, a, b) => page.evaluate(async ([x, y]) => {
  const leer = async b64 => { const bm = await createImageBitmap(await (await fetch("data:image/png;base64," + b64)).blob());
    const c = new OffscreenCanvas(bm.width, bm.height), g = c.getContext("2d"); g.drawImage(bm, 0, 0); return g.getImageData(0, 0, bm.width, bm.height).data; };
  const [p, q] = [await leer(x), await leer(y)];
  if (p.length !== q.length) return false;
  let malos = 0;
  for (let i = 0; i < p.length; i += 4) if (Math.abs(p[i] - q[i]) + Math.abs(p[i + 1] - q[i + 1]) + Math.abs(p[i + 2] - q[i + 2]) + Math.abs(p[i + 3] - q[i + 3]) > 48) malos++;
  return malos <= 2;
}, [a.toString("base64"), b.toString("base64")]);
const PESTANAS = ["resumen", "graficas", "gente"];
const irA = async (page, sec) => { await page.click(`.tabs-m [data-sec="${sec}"]`); await page.waitForTimeout(60); };

console.log("Dashboard");

/* ---------------- 1. las pantallas se pintan, en los 3 recintos y los 2 modos, sin errores ---------------- */
await prueba("las dos pantallas se pintan en los 3 recintos x claro y oscuro, con héroe, cifras y gráficas, sin errores", async () => {
  for (const [quien, ancho] of [["prof", 1280], ["ana", 1280], ["prof", 390], ["luis", 390]]) {
    const { ctx, page, errores } = await abrir(quien, { ancho });
    for (const r of RECINTOS) for (const m of MODOS) {
      await poner(page, r, m);
      const hay = await page.evaluate(() => ({
        h1: document.querySelector("main .hero h1.h1")?.textContent.trim(),
        kpis: document.querySelectorAll(".kpis .kpi").length,
        grafs: document.querySelectorAll(".graf").length,
        placa: !!document.querySelector("main .hero .placa-wrap"),
        viejo: document.querySelectorAll(".pill, .exclama, .fila-falta, .seg-m, .panel").length
      }));
      assert.ok(hay.h1 && hay.kpis >= 4 && hay.grafs >= 2 && hay.placa, `${quien}/${r}/${m}/${ancho}: ${JSON.stringify(hay)}`);
      assert.equal(hay.viejo, 0, "quedan clases del diseño anterior (.pill, .exclama, .fila-falta, .seg-m, .panel)");
    }
    assert.deepEqual(errores, [], `errores de consola en ${quien}/${ancho}`);
    await ctx.close();
  }
});

await prueba("instructor: héroe 'Panel del taller', mosaico con Entregadas dominante, Piden ser instructor en tono de información y leyenda de estados", async () => {
  const { ctx, page } = await abrir("prof");
  assert.equal(await page.$eval("main .hero h1", h => h.textContent.replace(/\s+/g, " ").trim()), "Panel del taller");
  const t = await page.evaluate(() => {
    const k = [...document.querySelectorAll(".kpis > *")].map(e => ({ cls: e.className, txt: e.textContent.replace(/\s+/g, " ").trim(), alto: e.getBoundingClientRect().height }));
    return { k, leyenda: document.querySelectorAll(".kpi-leyenda li").length, nuevo: document.querySelectorAll(".kpis .kpi.info .g use").length && document.querySelector(".kpis .kpi.info .g use").getAttribute("href") };
  });
  assert.match(t.k[0].cls, /kpi-grande/); assert.match(t.k[0].txt, /Entregadas/);
  assert.ok(t.k[0].alto > t.k[1].alto * 1.7, "la tarjeta dominante ocupa dos filas");
  assert.ok(t.k.some(x => /Piden ser instructor/.test(x.txt) && /\binfo\b/.test(x.cls)), "Piden ser instructor lleva el tono info");
  assert.equal(t.nuevo, "#g-info", "el aviso que no es veredicto usa el glifo de información");
  assert.ok(!t.k.some(x => /Piden/.test(x.txt) && /alerta/.test(x.cls)));
  assert.equal(t.leyenda, 4);
  const inc = await page.evaluate(() => { const e = document.querySelector(".kpi.alerta"); return e && { glifo: e.querySelector("use").getAttribute("href"), txt: e.textContent } });
  assert.equal(inc.glifo, "#g-inc");
  await ctx.close();
});

await prueba("gráficas: dona con textura y valor escrito, columnas con base en los ceros y 'hoy' en el color de marca, barras con extremo cortado", async () => {
  const { ctx, page } = await abrir("prof");
  await recorrer(page);
  const g = await page.evaluate(() => {
    const aro = document.querySelector(".dona-aro svg");
    const trazos = [...aro.querySelectorAll(".arco")].map(c => c.getAttribute("stroke"));
    const cols = [...document.querySelectorAll(".cols .col")];
    const hoy = cols.at(-1), cero = cols.find(c => c.classList.contains("cero"));
    const marker = getComputedStyle(document.documentElement).getPropertyValue("--marker").trim();
    const bg = e => getComputedStyle(e.querySelector(".cuerpo")).backgroundColor;
    const mk = document.createElement("i"); mk.style.color = "var(--marker)"; document.body.append(mk);
    const colorMarca = getComputedStyle(mk).color; mk.remove();
    const barra = document.querySelector(".hb-b i");
    return { trazos, n: cols.length, hoyMarca: bg(hoy) === colorMarca, hoyClase: hoy.classList.contains("hoy"),
      ceroAlto: cero && cero.querySelector(".cuerpo").getBoundingClientRect().height,
      leyenda: [...document.querySelectorAll(".dona-ley li")].map(l => l.textContent.replace(/\s+/g, " ").trim()),
      clip: getComputedStyle(barra).clipPath, marker };
  });
  assert.ok(g.trazos.every(s => /^url\(["']?#px-(apto|obs|no)["']?\)$/.test(s)), "los arcos usan las texturas del sprite: " + g.trazos);
  assert.equal(g.n, 14);
  assert.ok(g.hoyClase && g.hoyMarca, "la columna de hoy lleva el marcador del recinto");
  assert.ok(g.ceroAlto >= 3.5, "un día sin entregas deja una base visible: " + g.ceroAlto);
  assert.ok(g.leyenda.every(t => /\d/.test(t) && /%/.test(t)), "cada serie escribe su valor y su porcentaje: " + g.leyenda);
  assert.match(g.clip, /polygon/, "el extremo de la barra va cortado");
  await ctx.close();
});

await prueba("estudiante: héroe 'Hola, Nombre', Nuevo diagnóstico, Continuar borrador, 4 cifras con una dominante, alerta de incompletas y recientes con los 4 patrones", async () => {
  const { ctx, page } = await abrir("luis");
  assert.match(await page.$eval("main .hero h1", h => h.textContent.replace(/\s+/g, " ").trim()), /^Hola, Luis$/);
  assert.equal(await page.locator("#d-nuevo").count(), 1);
  assert.equal(await page.locator("#d-nuevo").evaluate(b => b.classList.contains("marca-b")), true);
  assert.equal(await page.locator(".kpis .kpi").count(), 4);
  assert.equal(await page.locator(".kpi-prim").count(), 1);
  assert.equal(await page.locator(".alerta-cap").count(), 1, "Luis tiene una hoja incompleta y debe verse");
  assert.equal(await page.locator(".alerta-cap .estado[data-v='inc']").count(), 1);
  assert.equal(await page.locator(".alerta-cap h2").textContent(), "Completa esta hoja");
  // el chip de incompleto tiene glifo + palabra
  const chip = await page.$eval(".alerta-cap .estado", e => ({ t: e.textContent.trim(), u: e.querySelector("use").getAttribute("href") }));
  assert.deepEqual(chip, { t: "Incompleto", u: "#g-inc" });
  assert.ok(await page.locator(".rec.fila-v").count() >= 1);
  await ctx.close();
});

/* ---------------- 2. sin desborde horizontal ---------------- */
await prueba("sin desborde horizontal a 320, 375, 390, 768 y 1280 (scrollWidth y scrollTo real), en los 3 recintos", async () => {
  for (const quien of ["prof", "luis"]) for (const ancho of [320, 375, 390, 768, 1280]) {
    const { ctx, page } = await abrir(quien, { ancho });
    for (const r of RECINTOS) {
      await poner(page, r, "claro");
      for (const sec of ancho < 760 ? (quien === "prof" ? PESTANAS : ["resumen", "graficas"]) : [null]) {
        if (sec) await irA(page, sec);
        const d = await sinDesborde(page);
        assert.ok(d.ok, `desborde ${quien}/${r}/${ancho}/${sec}: ${JSON.stringify(d)}`);
      }
    }
    await ctx.close();
  }
});

await prueba("instructor: los cinco accesos del héroe nunca quedan bajo la placa del escudo (768 a 1280), y el subtítulo nombra el recinto", async () => {
  for (const ancho of [768, 820, 900, 1024, 1280]) {
    const { ctx, page } = await abrir("prof", { ancho });
    const r = await page.evaluate(() => {
      const placa = document.querySelector(".ins-hero .placa-wrap").getBoundingClientRect();
      const tapados = [...document.querySelectorAll(".ins-hero .hero-acc .btn")].map(b => {
        const c = b.getBoundingClientRect();
        const w = Math.max(0, Math.min(c.right, placa.right) - Math.max(c.left, placa.left)), h = Math.max(0, Math.min(c.bottom, placa.bottom) - Math.max(c.top, placa.top));
        return { t: b.textContent.trim(), tapado: w * h / (c.width * c.height) };
      });
      return { tapados, sub: document.querySelector(".ins-hero .hero-sub").textContent };
    });
    for (const b of r.tapados) assert.ok(b.tapado < .01, `${ancho}px: «${b.t}» queda ${Math.round(b.tapado * 100)} % bajo la placa`);
    assert.match(r.sub, /Recinto de San\sJuan|Sistema ITPR|Recinto de Manatí/, "el subtítulo dice el recinto: " + r.sub);
    await ctx.close();
  }
});

/* ---------------- 3. teléfono: pestañas, objetivos táctiles, tarjetas ---------------- */
await prueba("teléfono: pestañas Resumen/Gráficas/Gente, una sección a la vez, el subrayado no queda bajo el primer capítulo", async () => {
  const { ctx, page } = await abrir("prof", { ancho: 390 });
  const vis = sel => page.locator(sel).first().isVisible();
  assert.equal(await page.locator(".tabs-m").isVisible(), true);
  assert.equal(await page.locator(".tabs-m button[aria-pressed]").count(), 3);
  assert.equal(await page.locator(".tabs-m [role=tab], .tabs-m [role=tabpanel]").count(), 0, "sin roles de pestañas a medias: son botones con aria-pressed");
  assert.equal(await vis(".kpis"), true); assert.equal(await vis(".dona"), false); assert.equal(await vis("#d-usuarios"), false);
  await irA(page, "graficas");
  assert.equal(await page.locator('.tabs-m [data-sec="graficas"]').getAttribute("aria-pressed"), "true");
  assert.equal(await vis(".dona"), true); assert.equal(await vis(".kpis"), false);
  await irA(page, "gente");
  assert.equal(await vis("#d-usuarios"), true); assert.equal(await vis(".dona"), false);
  // el subrayado de la pestaña activa (::before/::after salen 4px bajo el botón) cae en el espacio propio de la barra de pestañas
  await irA(page, "resumen");
  const bajo = await page.evaluate(() => {
    const b = document.querySelector('.tabs-m [aria-pressed="true"]'); b.scrollIntoView({ block: "center" }); const r = b.getBoundingClientRect();   // el héroe del teléfono es alto: las pestañas pueden quedar bajo el primer pliegue
    const e = document.elementFromPoint(r.left + r.width / 2, r.bottom + 2);
    const t = b.closest(".tabs-m").getBoundingClientRect();
    return { dentro: !!e && !!e.closest(".tabs-m"), bajoBarra: r.bottom + 4 <= t.bottom + .5 };
  });
  assert.ok(bajo.dentro && bajo.bajoBarra, "subrayado tapado: " + JSON.stringify(bajo));
  // y sigue pegada arriba al desplazar
  await irA(page, "graficas");
  await page.evaluate(() => scrollTo(0, 1400)); await page.waitForTimeout(80);
  assert.ok(await page.$eval(".tabs-m", e => e.getBoundingClientRect().top) <= 1, "las pestañas se pegan arriba");
  await ctx.close();
});

await prueba("teléfono: todo control mide al menos 44px (instructor en sus 3 pestañas, estudiante en 2)", async () => {
  const chicos = page => page.evaluate(() => [...document.querySelectorAll("main button, main a[href], main input, main select, main [role=tab]")]
    .filter(e => { const r = e.getBoundingClientRect(), cs = getComputedStyle(e); return r.width && r.height && cs.visibility !== "hidden"; })
    .map(e => { const r = e.getBoundingClientRect(); return { e: `${e.tagName.toLowerCase()}.${String(e.className).split(" ")[0]} "${(e.textContent || e.placeholder || "").trim().slice(0, 24)}"`, w: Math.round(r.width), h: Math.round(r.height) }; })
    .filter(x => x.h < 44 || x.w < 44));
  for (const [quien, secs] of [["prof", PESTANAS], ["luis", ["resumen", "graficas"]]]) {
    const { ctx, page } = await abrir(quien, { ancho: 375 });
    for (const s of secs) { await irA(page, s); const c = await chicos(page); assert.deepEqual(c, [], `${quien}/${s} controles chicos`); }
    await ctx.close();
  }
});

await prueba("Gente: busca, 'Pide ser instructor' lleva glifo de información, tabla a 1280 y tarjetas sin scroll lateral a 390 y 768", async () => {
  const { ctx, page } = await abrir("prof");
  const txt = () => page.textContent("#d-usuarios");
  assert.ok((await txt()).includes("Ana Rivera"));
  assert.equal(await page.locator("#d-usuarios table.datos th").count(), 6);
  assert.equal(await page.locator("#d-usuarios .chip:has(use[href='#g-info'])").count(), 1, "Ana pide ser instructor");
  await page.fill("#d-buscar", "luis");
  assert.ok(!(await txt()).includes("Ana Rivera") && (await txt()).includes("Luis Díaz"), "la búsqueda filtra");
  await page.fill("#d-buscar", "zzz");
  assert.match(await txt(), /Nadie coincide/);
  await page.fill("#d-buscar", "");
  await ctx.close();
  for (const ancho of [390, 768]) {
    const { ctx: c2, page: p2 } = await abrir("prof", { ancho });
    if (ancho < 760) await irA(p2, "gente");
    const m = await p2.evaluate(() => { const t = document.querySelector("#d-usuarios table"), env = t.closest(".tabla-env");
      return { bloque: getComputedStyle(t).display, scroll: env.scrollWidth > env.clientWidth + 1, thead: getComputedStyle(t.tHead).display }; });
    assert.equal(m.bloque, "block", "la tabla pasa a tarjetas a " + ancho); assert.equal(m.scroll, false); assert.equal(m.thead, "none");
    assert.ok((await sinDesborde(p2)).ok);
    await c2.close();
  }
});

/* ---------------- 4. nombres largos ---------------- */
await prueba("nombres largos (Guillermina, Maximiliano, Jean Carlos) no se cortan ni desbordan a 320 y 375", async () => {
  const ana = PERFILES.find(p => p.usuario === "ana"), antes = ana.nombre;
  try {
    for (const nombre of ["Guillermina Maldonado", "Maximiliano Cintrón", "Jean Carlos Nieves", "Hiram"]) {
      ana.nombre = nombre;
      for (const ancho of [320, 375]) {
        const { ctx, page } = await abrir("ana", { ancho, recinto: "manati" });
        await page.waitForTimeout(400);
        const r = await page.evaluate(() => {
          const h = document.querySelector("main .hero h1"), hero = document.querySelector("main .hero");
          const hr = h.getBoundingClientRect(), pr = hero.getBoundingClientRect();
          const lineas = [...h.querySelectorAll(".linea > span")];
          return { sc: h.scrollWidth, cw: h.clientWidth, dentro: hr.left >= pr.left && hr.right <= pr.right + .5 && hr.right <= innerWidth,
            recortada: lineas.some(s => s.scrollWidth > s.clientWidth + 1), texto: h.textContent.replace(/\s+/g, " ").trim(), fit: h.style.getPropertyValue("--fit"), parte: h.classList.contains("parte"),
            fuente: parseFloat(getComputedStyle(h).fontSize) };
        });
        assert.ok(r.dentro && !r.recortada && r.sc <= r.cw + 1, `${nombre}@${ancho}: ${JSON.stringify(r)}`);
        assert.ok(r.fuente >= 20, `${nombre}@${ancho}: el titular queda ilegible (${r.fuente}px)`);
        assert.ok((await sinDesborde(page)).ok, `desborde con ${nombre}@${ancho}`);
        await ctx.close();
      }
    }
  } finally { ana.nombre = antes; }
});

/* ---------------- 5. marcas oficiales ---------------- */
await prueba("marcas oficiales en el héroe: sin giro, sin recorte de un ancestro, proporción al 1 % y tamaños mínimos (3 recintos x 2 modos x 360/375/390/1280)", async () => {
  const MIN = { "tiburon.webp": 72, "puma.webp": 64, "itpr-marca.webp": 24, "itpr-manati.webp": 160, "itpr-manati-claro.webp": 160, "depr.webp": 140 };
  let revisadas = 0;
  for (const quien of ["prof", "luis"]) for (const ancho of [360, 375, 390, 1280]) {
    const { ctx, page } = await abrir(quien, { ancho });
    await recorrer(page);
    for (const r of RECINTOS) for (const m of MODOS) {
      await poner(page, r, m);
      await page.waitForTimeout(450);                                 // que terminen los fundidos de color antes de comparar píxeles
      const logos = await page.evaluate(() => [...document.querySelectorAll("main img")].map((img, n) => {
        const rc = img.getBoundingClientRect(), cs = getComputedStyle(img);
        if (!rc.width || !rc.height || cs.visibility === "hidden" || cs.display === "none") return null;
        img.dataset.auditoria = String(n);
        const cadena = []; for (let e = img; e && e !== document.documentElement; e = e.parentElement) cadena.push(e);
        const nat = img.naturalWidth / img.naturalHeight;
        return { n, archivo: img.src.split("/").pop(), w: rc.width, desvio: Math.abs(rc.width / rc.height / nat - 1),
          transforms: cadena.map(e => getComputedStyle(e).transform).filter(t => t !== "none"),
          recortes: cadena.filter(e => getComputedStyle(e).clipPath !== "none").length };
      }).filter(Boolean));
      assert.ok(logos.length >= 1, `${quien}/${r}/${m}/${ancho}: el héroe no muestra ninguna marca`);
      for (const l of logos) {
        revisadas++;
        const donde = `${quien}/${r}/${m}/${ancho} ${l.archivo}`;
        assert.deepEqual(l.transforms, [], `${donde}: transform en la marca o un ancestro`);
        assert.ok(l.desvio <= .01, `${donde}: deformada ${(l.desvio * 100).toFixed(1)} %`);
        assert.ok(l.w >= MIN[l.archivo] - .5, `${donde}: ancho ${l.w.toFixed(0)} < mínimo ${MIN[l.archivo]}`);
        if (l.recortes) {                                                  // ¿el clip-path de un ancestro toca la imagen?
          const el = page.locator(`img[data-auditoria="${l.n}"]`);
          await el.scrollIntoViewIfNeeded();
          const a = await el.screenshot();
          await page.evaluate(n => { for (let e = document.querySelector(`img[data-auditoria="${n}"]`); e && e !== document.documentElement; e = e.parentElement) if (getComputedStyle(e).clipPath !== "none") { e.dataset.cp = "1"; e.style.setProperty("clip-path", "none", "important"); } }, l.n);
          const b = await el.screenshot();
          await page.evaluate(() => document.querySelectorAll("[data-cp]").forEach(e => { e.style.removeProperty("clip-path"); delete e.dataset.cp; }));
          assert.ok(await iguales(page, a, b), `${donde}: un clip-path de un ancestro recorta la marca`);
        }
      }
    }
    await ctx.close();
  }
  assert.ok(revisadas >= 48, "se revisaron pocas marcas: " + revisadas);
});

/* ---------------- 6. movimiento ---------------- */
await prueba("reducir movimiento: todo visible sin recorrido, la cifra no sube y ni la dona ni las columnas ni las barras viajan", async () => {
  const { ctx, page } = await abrir("prof", { reducir: true, humano: true });
  await recorrer(page);
  const r = await page.evaluate(() => {
    const viajan = [...document.querySelectorAll(".rev, .linea > span, .col .cuerpo, .barra-g, .dona-aro .anillo")]
      .filter(e => { const t = getComputedStyle(e).transform; return t !== "none"; }).length;
    const ocultos = [...document.querySelectorAll(".rev")].filter(e => getComputedStyle(e).opacity !== "1").length;
    return { viajan, ocultos, cifras: [...document.querySelectorAll("[data-cuenta]")].every(e => e.textContent === e.dataset.cuenta) };
  });
  assert.equal(r.viajan, 0, "algo se queda transformado");
  assert.equal(r.ocultos, 0, "algo sigue oculto");
  assert.equal(r.cifras, true);
  await ctx.close();
});

await prueba("cifra que sube: una vez, de 0 al valor en menos de 1 s, y se queda; sin JavaScript de entrada la cifra está escrita", async () => {
  const { ctx, page } = await abrir("prof", { humano: true });
  const muestras = await page.evaluate(async () => {
    const e = document.querySelector(".kpi-grande .kpi-v"), fin = Number(e.dataset.cuenta), v = [];
    for (let i = 0; i < 14; i++) { v.push(e.textContent); await new Promise(f => setTimeout(f, 80)); }
    return { fin, v };
  });
  assert.equal(muestras.v.at(-1), String(muestras.fin), "termina en el valor");
  const nums = muestras.v.map(Number);
  assert.ok(nums.every((n, i) => i === 0 || n >= nums[i - 1]), "solo sube: " + nums);
  // volver a la pantalla no repite el ruido: el valor ya escrito en el HTML es el final
  const html = await page.$eval(".kpi-grande .kpi-v", e => e.dataset.cuenta);
  assert.equal(html, String(muestras.fin));
  await ctx.close();
  // sin humano (automatización) la cifra está ya puesta desde el primer cuadro
  const { ctx: c2, page: p2 } = await abrir("prof");
  assert.equal(await p2.$eval(".kpi-grande .kpi-v", e => e.textContent), await p2.$eval(".kpi-grande .kpi-v", e => e.dataset.cuenta));
  await c2.close();
});

await prueba("sin transition: all, el roce solo dentro de (hover:hover) y las tarjetas se mueven con el puntero", async () => {
  const { ctx, page } = await abrir("prof", { recinto: "itpr" });
  await recorrer(page);
  await page.waitForTimeout(1800);                                       // termina la entrada (.hecho)
  const prop = await page.$eval(".kpi:not(.kpi-grande)", e => getComputedStyle(e).transitionProperty);
  assert.ok(!/\ball\b/.test(prop), "transition-property: " + prop);
  const hojas = await page.evaluate(() => [...document.styleSheets].filter(s => /v-dashboard/.test(s.href || "")).map(s => [...s.cssRules].map(r => r.cssText).join("\n")).join("\n"));
  assert.ok(hojas.length > 500, "no se leyó v-dashboard.css");
  assert.ok(!/transition:\s*all/.test(hojas), "v-dashboard.css usa transition: all");
  const k = page.locator(".kpi:not(.kpi-grande)").first();
  await k.scrollIntoViewIfNeeded();
  await k.hover(); await page.waitForTimeout(350);
  assert.match(await k.evaluate(e => getComputedStyle(e).transform), /matrix\(1, 0, 0, 1, 0, -3\)/, "ITPR: sube 3 px");
  await ctx.close();
});


/* ---------------- contraste ---------------- */
await prueba("contraste WCAG AA del texto de las dos pantallas en los 3 recintos x claro y oscuro (texto contra su fondo real)", async () => {
  const medir = page => page.evaluate(() => {
    const nums = s => (s.match(/-?d*.?d+(?:e-?d+)?/g) || []).map(Number);
    const parse = c => c.startsWith("color(") ? (v => [v[0] * 255, v[1] * 255, v[2] * 255, v[3] ?? 1])(nums(c.replace("srgb", "")))
      : c.startsWith("rgb") ? (v => [v[0], v[1], v[2], v[3] ?? 1])(nums(c)) : [255, 255, 255, 1];
    const sobre = (f, b) => [0, 1, 2].map(i => f[i] * f[3] + b[i] * (1 - f[3])).concat(1);
    const fondo = el => { const capas = []; for (let e = el; e; e = e.parentElement) { const c = parse(getComputedStyle(e).backgroundColor); if (c[3] > 0) capas.push(c); if (c[3] === 1) break; }
      return capas.reverse().reduce((b, c) => sobre(c, b), [255, 255, 255, 1]); };
    const lum = c => { const f = v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }; return .2126 * f(c[0]) + .7152 * f(c[1]) + .0722 * f(c[2]); };
    const malos = []; let n = 0;
    for (const el of document.querySelectorAll("main *, header *")) {
      if (![...el.childNodes].some(t => t.nodeType === 3 && t.textContent.trim())) continue;
      const cs = getComputedStyle(el), r = el.getBoundingClientRect();
      if (!r.width || !r.height || cs.visibility === "hidden" || el.closest(".sr,[hidden]")) continue;
      let op = 1; for (let e = el; e; e = e.parentElement) op *= Number(getComputedStyle(e).opacity); if (op < 1) continue;
      const bg = fondo(el), fg = sobre(parse(cs.color), bg), a = lum(fg), b = lum(bg);
      const ratio = (Math.max(a, b) + .05) / (Math.min(a, b) + .05), px = parseFloat(cs.fontSize);
      const grande = px >= 24 || (px >= 18.66 && Number(cs.fontWeight) >= 700);
      n++;
      if (ratio < (grande ? 3 : 4.5)) malos.push(`${el.tagName.toLowerCase()}.${String(el.className).split(" ")[0]} "${el.textContent.trim().slice(0, 28)}" ${ratio.toFixed(2)} (${cs.color} sobre ${getComputedStyle(el).backgroundColor})`);
    }
    return { n, malos };
  });
  let total = 0;
  for (const quien of ["prof", "luis"]) {
    const { ctx, page } = await abrir(quien, { ancho: 1280 });
    await recorrer(page);
    for (const r of RECINTOS) for (const m of MODOS) {
      await poner(page, r, m);
      await page.waitForTimeout(450);
      const x = await medir(page);
      total += x.n;
      assert.deepEqual(x.malos, [], `${quien}/${r}/${m}: texto bajo AA`);
    }
    await ctx.close();
  }
  assert.ok(total > 1000, "se midieron pocos textos: " + total);
});

/* ---------------- 7. interacciones ---------------- */
await prueba("interacciones: las tarjetas llevan a su pestaña, Código QR y Completar abren lo suyo", async () => {
  const { ctx, page } = await abrir("prof");
  await page.click('.kpi[data-ir="informes:incompletos"]');
  await page.waitForSelector("main[data-vista=instructor]");
  await ctx.close();
  const { ctx: c2, page: p2 } = await abrir("prof");
  await p2.click("#d-codigo");
  await p2.waitForSelector("main[data-vista=codigo]");
  await c2.close();
  const { ctx: c3, page: p3 } = await abrir("luis");
  await p3.click(".alerta-cap [data-abrir]");
  await p3.waitForSelector("main[data-vista=reporte]");   // una hoja entregada abre su informe
  await c3.close();
  const { ctx: c4, page: p4 } = await abrir("luis");
  await p4.click(".rec[data-abrir]");
  await p4.waitForSelector("main[data-vista=reporte]");
  await c4.close();
});

/* ---------------- capturas ---------------- */
if (CAPTURAS) {
  const { mkdirSync } = await import("node:fs");
  mkdirSync(SHOTS, { recursive: true });
  // datos de muestra más ricos para que las capturas se parezcan a un taller de verdad
  const dia = n => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
  const nombres = [["e4", "vortiz", "Valeria Ortiz"], ["e5", "ksantiago", "Kiara Santiago"], ["e6", "grosado", "Gabriel Rosado"], ["e7", "hvazquez", "Héctor Vázquez"],
    ["e8", "jcnieves", "Jean Carlos Nieves"], ["e9", "mcintron", "Maximiliano Cintrón"]];
  nombres.forEach(([id, u, n], i) => PERFILES.push({ id, usuario: u, nombre: n, grupo: i % 3 ? "TESI 2" : "TESI 1", rol: "estudiante", email: i % 2 ? `${u}@correo.example` : "", solicita_instructor: i === 2, recinto: "" }));
  PERFILES.push({ id: "i2", usuario: "mcruz", nombre: "Marisol Cruz", grupo: "Redes 3", rol: "instructor", email: "mcruz@itpr.example", solicita_instructor: false, recinto: "" });
  const marcas = ["HP", "Dell", "Lenovo", "Acer"], salones = ["Salón 204", "Lab 3", "Salón 206"];
  for (let i = 0; i < 12; i++) EQUIPOS.push({ id: `qq${i}`, serial: `SN${4000 + i}XK`, marca: marcas[i % 4], modelo: "Modelo " + (i + 1), tipo: "", inventario: "", ubicacion: salones[i % 3], creado_por: "e1" });
  const autores = ["e1", "e2", "e3", "e4", "e5", "e6", "e7", "e8", "e9"], vv = ["apto", "obs", "no", "apto", "apto", "obs"];
  let k = 0;
  for (const a of autores) for (let j = 0; j < 4; j++, k++) {
    const inc = k % 7 === 3, bor = k % 5 === 4, eq = EQUIPOS[(k % 12) + 2];
    DIAGS.push({ id: `dd${k}`, autor_id: a, equipo_id: eq.id, orden: `DX-${100 + k}`, fecha: dia((k * 2 + j) % 13), estado: bor ? "borrador" : "entregado",
      veredicto: bor ? null : vv[k % 6], conteo: { ok: inc ? 30 : 36, obs: 1, falla: k % 6 === 2 ? 2 : 0, na: 1, sin: inc ? 3 : 0 },
      sistema: inc ? "" : "Windows 11", hallazgos: inc ? "" : "Todo en orden", nota: !bor && !inc && k % 3 ? 70 + (k * 7) % 30 : null,
      actualizado_en: `2026-10-${10 + (k % 10)}T15:00:00Z`, equipos: eq });
  }
  const tomar = async (page, nombre, sec) => { await recorrer(page); await page.screenshot({ path: join(SHOTS, nombre), fullPage: true }); };
  for (const m of MODOS) {
    for (const [quien, rol] of [["prof", "instructor"], ["luis", "estudiante"]]) {
      // escritorio 1280
      let { ctx, page } = await abrir(quien, { ancho: 1280, modo: m });
      await recorrer(page);
      for (const r of RECINTOS) { await poner(page, r, m); await page.waitForTimeout(150); await page.screenshot({ path: join(SHOTS, `${rol}-${r}-${m}-1280.png`), fullPage: true }); }
      await ctx.close();
      // teléfono 390, cada pestaña
      for (const sec of rol === "instructor" ? PESTANAS : ["resumen", "graficas"]) {
        ({ ctx, page } = await abrir(quien, { ancho: 390, modo: m }));
        await irA(page, sec);
        await recorrer(page);
        for (const r of RECINTOS) { await poner(page, r, m); await page.waitForTimeout(150); await page.screenshot({ path: join(SHOTS, `${rol}-${sec}-${r}-${m}-390.png`), fullPage: true }); }
        await ctx.close();
      }
    }
  }
  console.log("  capturas en", SHOTS);
}

await terminar();
