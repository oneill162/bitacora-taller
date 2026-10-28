// Auditoría de marcas oficiales (docs/img/LEEME.md), compartida por marcas.mjs (matriz completa) y ui.mjs.
// Para cada logo visible de la pantalla abierta:
//   - sin giro ni escala: ni la imagen ni ningún ancestro tiene transform al reposo;
//   - sin recorte: quitar el clip-path de los ancestros no cambia ni un píxel de la imagen;
//   - sin deformar: la proporción de la caja de contenido está a menos de 1 % de la natural;
//   - con tamaño mínimo (ancho CSS): tiburón 72, puma 64, marca ITPR 24, lockup Manatí 160, DEPR 140;
//   - sin filtro ni opacidad parcial sobre la marca;
//   - sobre su placa: el primer fondo opaco detrás es claro (--placa) para todas las marcas menos
//     itpr-manati-claro (que es para fondos oscuros), y nunca rojo de marca, oro ni el azul #05568D;
//   - espacio libre de 12 % del alto cuando la placa es del tamaño de la marca (no el papel de la página);
//   - el chaflán de 30° de la placa (clip-path) tampoco entra al espacio libre: se muestrea el borde de la caja ensanchada 12 %
//     y se pregunta con elementsFromPoint (que respeta clip-path) si cada punto sigue dentro de la placa.
// Píxeles que cambian de verdad entre dos capturas (más de 12/255 en algún canal): el remuestreo de la imagen con y
// sin clip-path mueve un píxel por 1/255 y eso no es un recorte.
export const pixelesDistintos = (page, a, b) => page.evaluate(async ([a, b]) => {
  const cargar = s => new Promise(r => { const im = new Image(); im.onload = () => r(im); im.src = "data:image/png;base64," + s; });
  const [A, B] = await Promise.all([cargar(a), cargar(b)]);
  if (A.width !== B.width || A.height !== B.height) return 1e9;
  const c = document.createElement("canvas"); c.width = A.width; c.height = A.height;
  const x = c.getContext("2d", { willReadFrequently: true });
  x.drawImage(A, 0, 0); const da = x.getImageData(0, 0, c.width, c.height).data;
  x.clearRect(0, 0, c.width, c.height); x.drawImage(B, 0, 0); const db = x.getImageData(0, 0, c.width, c.height).data;
  let n = 0;
  for (let k = 0; k < da.length; k += 4) if (Math.max(Math.abs(da[k] - db[k]), Math.abs(da[k + 1] - db[k + 1]), Math.abs(da[k + 2] - db[k + 2]), Math.abs(da[k + 3] - db[k + 3])) > 12) n++;
  return n;
}, [a.toString("base64"), b.toString("base64")]);

export const MIN = { "tiburon.webp": 72, "puma.webp": 64, "itpr-marca.webp": 24, "itpr-manati.webp": 160, "itpr-manati-claro.webp": 160, "depr.webp": 140 };

// Recorre la pantalla para que terminen las entradas (.rev empieza en opacidad 0 hasta que se observa).
export async function recorrer(page, espera = 1000) {
  await page.evaluate(async () => { const h = document.documentElement.scrollHeight; for (let y = 0; y < h; y += 300) { scrollTo(0, y); await new Promise(f => setTimeout(f, 80)); } scrollTo(0, h); await new Promise(f => setTimeout(f, 400)); scrollTo(0, 0); });
  await page.waitForTimeout(espera);
  // que terminen las entradas y los fundidos (las animaciones infinitas no cuentan)
  await page.waitForFunction(() => document.getAnimations().every(a => a.playState !== "running" || a.effect?.getComputedTiming().iterations === Infinity), null, { timeout: 5000 }).catch(() => {});
}

export async function auditarMarcas(page, donde, { espera = 1000 } = {}) {
  await recorrer(page, espera);
  const logos = await page.evaluate(() => {
    const rgba = c => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const [r, g, b, a = 1] = m[1].split(/[ ,\/]+/).filter(Boolean).map(Number); return { r, g, b, a }; };
    return [...document.querySelectorAll("img")].filter(i => /\/img\/(tiburon|puma|itpr-marca|itpr-manati|itpr-manati-claro|depr)\.webp/.test(i.src)).map((img, n) => {
      const r = img.getBoundingClientRect(), cs = getComputedStyle(img);
      if (!r.width || !r.height || cs.visibility === "hidden") return null;
      img.dataset.auditoria = String(n);
      const cadena = []; for (let e = img; e && e !== document.documentElement; e = e.parentElement) cadena.push(e);
      if (cadena.some(e => getComputedStyle(e).display === "none")) return null;
      const pb = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight) + parseFloat(cs.borderLeftWidth) + parseFloat(cs.borderRightWidth);
      const pv = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom) + parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth);
      const desvio = cs.objectFit === "contain" || cs.objectFit === "scale-down" ? 0 : Math.abs((r.width - pb) / (r.height - pv) / (img.naturalWidth / img.naturalHeight) - 1);
      // primer ancestro con fondo opaco: la placa (o el papel)
      let placa = null;
      for (const e of cadena.slice(1)) { const c = rgba(getComputedStyle(e).backgroundColor); if (c && c.a >= .9) { placa = { e, c }; break; } }
      const pr = placa ? placa.e.getBoundingClientRect() : null;
      const libre = pr && placa.e !== document.body ? Math.min(r.left - pr.left, pr.right - r.right, r.top - pr.top, pr.bottom - r.bottom) : null;
      return {
        n, archivo: img.src.split("/").pop(), w: r.width, h: r.height, desvio,
        transforms: cadena.map(e => getComputedStyle(e).transform).filter(t => t !== "none"),
        filtro: cadena.some(e => getComputedStyle(e).filter !== "none"),
        opacidad: cadena.map(e => +getComputedStyle(e).opacity).filter(o => o < .99).length,
        recortes: cadena.filter(e => getComputedStyle(e).clipPath !== "none").length,
        fondo: placa ? placa.c : null, clase: placa ? placa.e.className || placa.e.tagName : "",
        libre, placaGrande: pr ? pr.height > r.height * 3 || pr.width > r.width * 3 : true
      };
    }).filter(Boolean);
  });
  const lum = ({ r, g, b }) => { const f = v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }; return .2126 * f(r) + .7152 * f(g) + .0722 * f(b); };
  const cerca = (c, [r, g, b], t) => Math.abs(c.r - r) < t && Math.abs(c.g - g) < t && Math.abs(c.b - b) < t;
  const fallas = [];
  for (const l of logos) {
    const mal = [];
    if (l.transforms.length) mal.push("transform en la marca o un ancestro: " + l.transforms.join(" | "));
    if (l.filtro) mal.push("filtro sobre la marca o un ancestro");
    if (l.opacidad) mal.push("opacidad parcial en la marca o un ancestro");
    if (l.desvio > .01) mal.push("deformada " + (l.desvio * 100).toFixed(1) + " %");
    if (l.w < MIN[l.archivo] - .5) mal.push(`ancho ${l.w.toFixed(0)} < mínimo ${MIN[l.archivo]}`);
    if (!l.fondo) mal.push("sin fondo opaco detrás");
    else {
      const L = lum(l.fondo), oscura = l.archivo === "itpr-manati-claro.webp";
      if (!oscura && L < .8) mal.push(`fondo no claro detrás (${l.clase}, luminancia ${L.toFixed(2)})`);
      if (oscura && L > .3) mal.push(`el lockup claro va sobre fondo claro (${l.clase})`);
      if (cerca(l.fondo, [228, 41, 39], 40) || cerca(l.fondo, [254, 0, 0], 40)) mal.push("marca sobre rojo de marca");
      if (cerca(l.fondo, [253, 216, 8], 40)) mal.push("marca sobre oro");
      if (cerca(l.fondo, [5, 86, 141], 14)) mal.push("marca sobre el azul #05568D");
      if (!l.placaGrande && l.libre !== null && l.libre < l.h * .12 - 1) mal.push(`espacio libre ${(l.libre / l.h * 100).toFixed(0)} % < 12 % (${l.clase})`);
    }
    if (l.recortes) {                                                        // ¿el clip-path de algún ancestro toca la imagen?
      const el = page.locator(`img[data-auditoria="${l.n}"]`);
      await el.scrollIntoViewIfNeeded();
      // solo cuentan los píxeles de la imagen: se quitan los fondos de la placa y de la página para que un clip-path
      // que corta una esquina vacía de la caja (el chaflán de la placa) no se tome por un recorte de la marca
      await page.evaluate(n => { const i = document.querySelector(`img[data-auditoria="${n}"]`); for (let e = i; e; e = e.parentElement) { e.dataset.bg = "1"; e.style.setProperty("background", "transparent", "important"); e.style.setProperty("box-shadow", "none", "important"); e.style.setProperty("transition", "none", "important"); } }, l.n);
      const a = await el.screenshot();
      await page.evaluate(n => { const i = document.querySelector(`img[data-auditoria="${n}"]`); for (let e = i; e && e !== document.documentElement; e = e.parentElement) if (getComputedStyle(e).clipPath !== "none") { e.dataset.cp = "1"; e.style.setProperty("clip-path", "none", "important"); } }, l.n);
      const b = await el.screenshot();
      await page.evaluate(() => { document.querySelectorAll("[data-cp]").forEach(e => { e.style.removeProperty("clip-path"); delete e.dataset.cp; }); document.querySelectorAll("[data-bg]").forEach(e => { e.style.removeProperty("background"); e.style.removeProperty("box-shadow"); e.style.removeProperty("transition"); delete e.dataset.bg; }); });
      if (await pixelesDistintos(page, a, b) > 2) mal.push("un clip-path de un ancestro recorta la marca");
      const entra = await page.evaluate(n => {
        const img = document.querySelector(`img[data-auditoria="${n}"]`);
        let cp = null;
        for (let e = img.parentElement; e && e !== document.documentElement; e = e.parentElement) if (getComputedStyle(e).clipPath !== "none") { cp = e; break; }
        if (!cp) return 0;
        img.scrollIntoView({ block: "center" });
        const b = img.getBoundingClientRect(), nr = img.naturalWidth / img.naturalHeight;
        let cw = b.width, ch = b.height; if (cw / ch > nr) cw = ch * nr; else ch = cw / nr;     // object-fit: contain
        const cx = b.left + (b.width - cw) / 2, cy = b.top + (b.height - ch) / 2, m = ch * .12, R = cp.getBoundingClientRect();
        const previos = []; for (let e = img; e && e !== document.documentElement; e = e.parentElement) { previos.push([e, e.style.pointerEvents]); e.style.pointerEvents = "auto"; }
        const x0 = cx - m, y0 = cy - m, x1 = cx + cw + m, y1 = cy + ch + m;
        let fuera = 0;
        for (let i = 0; i <= 40; i++) {
          const t = i / 40;
          for (const [x, y] of [[x0 + t * (x1 - x0), y0], [x0, y0 + t * (y1 - y0)], [x1, y0 + t * (y1 - y0)], [x0 + t * (x1 - x0), y1]]) {
            if (x < R.left || x > R.right || y < R.top || y > R.bottom) continue;           // fuera de la caja de la placa lo cuenta "espacio libre"
            if (!document.elementsFromPoint(x, y).includes(cp)) fuera++;
          }
        }
        previos.forEach(([e, v]) => { e.style.pointerEvents = v; });
        return fuera;
      }, l.n);
      if (entra > 0) mal.push(`el chaflán de la placa entra al espacio libre de 12 % (${entra} puntos del borde)`);
    }
    if (mal.length) fallas.push(`${donde} ${l.archivo}: ${mal.join("; ")}`);
  }
  return { revisadas: logos.length, fallas };
}
