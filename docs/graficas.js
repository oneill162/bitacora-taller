// Gráficas del dashboard: HTML y SVG a mano, sin librería. Cada una lleva su cifra escrita
// (la información nunca depende solo del color: textura + palabra + valor al lado de la marca).
// Las entradas (barras con scaleX, columnas con scaleY, dona que gira y aparece) las anima estilo.css
// una sola vez y solo si hay JavaScript: sin él todo se ve ya terminado.
import { esc } from "./nucleo.js";
import { glifo } from "./campus.js";

const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

// Tarjeta de una cifra del mosaico. Si lleva `ir`, es un botón que lleva a donde se arregla.
//   tono "alerta" = incompletos (rosa, barra segmentada, glifo "!")   tono "info" = aviso que no es un veredicto
//   grande = la tarjeta dominante (dos filas, color de acción)        fuerte = cifra en negrita antes del subtítulo
//   ic = glifo del idioma de estados que va antes de la etiqueta     cuenta = la cifra sube desde 0 una vez (dashboard.js)
export function kpi({ valor, etiqueta, sub = "", fuerte = "", tono = "", ir = "", id = "", ic = "", grande = false, clase = "", cuenta = true }) {
  const n = Number(valor);
  const sube = cuenta && Number.isInteger(n) && n > 0 && String(valor).trim() === String(n);
  const cuerpo = `<span class="kpi-e">${ic ? glifo(ic) : ""}${esc(etiqueta)}</span><b class="kpi-v"${sube ? ` data-cuenta="${n}"` : ""}>${esc(valor)}</b>${
    sub || fuerte ? `<small class="kpi-s">${fuerte !== "" ? `<b>${esc(fuerte)}</b> ` : ""}${esc(sub)}</small>` : ""}`;
  const c = `kpi${grande ? " kpi-grande" : ""}${tono ? " " + tono : ""}${clase ? " " + clase : ""} rev`;
  return ir
    ? `<button type="button" class="${c}" data-ir="${esc(ir)}"${id ? ` id="${esc(id)}"` : ""}>${cuerpo}</button>`
    : `<div class="${c}"${id ? ` id="${esc(id)}"` : ""}>${cuerpo}</div>`;
}

// Un bloque de gráfica con su título y su nota; `clase` dice cuántas columnas ocupa (graf-a, graf-b, graf-c).
export const graf = (titulo, cuerpo, nota = "", clase = "graf-c") => `
  <section class="graf ${clase} rev">
    <h3>${esc(titulo)}</h3>${nota ? `<p class="nota">${esc(nota)}</p>` : ""}
    ${cuerpo}
  </section>`;

// Anillo de proporciones. items: [{ etiqueta, valor, v }] con v = apto | obs | no (la textura sale del sprite: #px-<v>).
// El valor va escrito en la leyenda con su muestra; el color nunca va solo.
export function dona(items, centro = "", etiquetaCentro = "", { de = "de las entregadas" } = {}) {
  const total = items.reduce((n, i) => n + i.valor, 0);
  if (!total) return `<p class="vacio-chico">Todavía no hay datos.</p>`;
  let acum = 0;
  const arcos = items.filter(i => i.valor > 0).map(i => {
    const p = i.valor / total * 100;
    const hueco = items.filter(x => x.valor > 0).length > 1 ? .7 : 0;     // un hilo de aire entre arcos; con uno solo, el anillo cierra
    const arco = `<circle class="arco" cx="21" cy="21" r="15.9155" fill="none" stroke="url(#px-${esc(i.v)})" stroke-width="6.6"
      stroke-dasharray="${(p - hueco).toFixed(2)} ${(100 - p + hueco).toFixed(2)}" stroke-dashoffset="${(25 - acum - hueco / 2).toFixed(2)}"/>`;
    acum += p;
    return arco;
  }).join("");
  const leyenda = items.map(i => `<li><span class="sw" data-v="${esc(i.v)}" aria-hidden="true"></span><span>${esc(i.etiqueta)}</span>
    <b>${i.valor}</b><small>${Math.round(i.valor / total * 100)} % ${esc(de)}</small></li>`).join("");
  const texto = items.map(i => `${i.etiqueta}: ${i.valor}`).join(", ");
  return `<div class="dona">
    <div class="dona-aro" role="img" aria-label="${esc(texto)}">
      <svg viewBox="0 0 42 42" aria-hidden="true"><g class="anillo"><circle cx="21" cy="21" r="15.9155" fill="none"
        style="stroke:var(--surface)" stroke-width="6.6"/>${arcos}</g></svg>
      <div class="dona-c"><b>${esc(centro)}</b><span>${esc(etiquetaCentro)}</span></div>
    </div>
    <ul class="dona-ley">${leyenda}</ul></div>`;
}

// Barras horizontales ordenadas, para comparar categorías con nombres largos. El extremo de cada barra va cortado a 30°.
// item.v (apto | obs | no | na) pinta la barra con la textura del veredicto; `mal` pinta todas con el rojo de falla.
export function barrasH(items, { vacio = "Todavía no hay datos.", mal = false } = {}) {
  const max = Math.max(0, ...items.map(i => i.valor));
  if (!max) return `<p class="vacio-chico">${esc(vacio)}</p>`;
  return `<div class="hb">${items.map((i, k) => `
    <div class="hb-f"><span class="hb-n" title="${esc(i.etiqueta)}">${esc(i.etiqueta)}</span>
      <span class="hb-b"><i class="barra-g${mal ? " mal" : ""}"${i.v ? ` data-v="${esc(i.v)}"` : ""} style="width:${(i.valor / max * 100).toFixed(1)}%;--i:${k}"></i></span>
      <b class="hb-v">${i.valor}</b></div>`).join("")}</div>`;
}

// Columnas en el tiempo. `cada` rotula una de cada n para que quepan en un teléfono; la última (hoy / esta semana)
// lleva el color de marca del recinto (esta gráfica no pinta veredictos). Un periodo en cero deja una base visible.
export function columnas(items, { cada = 1, unidad = "hoja", ultima = "la marcada es hoy" } = {}) {
  const max = Math.max(0, ...items.map(i => i.valor));
  const total = items.reduce((n, i) => n + i.valor, 0);
  if (!total) return `<p class="vacio-chico">Todavía no hay datos en este periodo.</p>`;
  const ult = items.length - 1;
  return `<div class="cols" role="img" aria-label="${esc(items.map(i => `${i.etiqueta}: ${i.valor}`).join(", "))}">${
    items.map((i, k) => `
    <div class="col${k === ult ? " hoy" : ""}${i.valor ? "" : " cero"}" style="--i:${k}" title="${esc(`${i.etiqueta}: ${plural(i.valor, unidad, unidad + "s")}${k === ult ? " (" + ultima + ")" : ""}`)}">
      <b>${i.valor || ""}</b>
      <span class="cuerpo" style="height:${i.valor ? Math.max(9, i.valor / max * 78).toFixed(1) : 0}%"></span>
      <small>${(ult - k) % cada === 0 ? esc(i.etiqueta) : ""}</small>
    </div>`).join("")}</div>`;
}
