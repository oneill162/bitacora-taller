// Gráficas del dashboard: HTML y SVG a mano, sin librería. Cada una lleva su cifra
// escrita (la información nunca depende solo del color) y se anima una sola vez,
// con transform/clip-path/stroke y menos de 700 ms; con "reducir movimiento"
// se dibujan ya terminadas (ver estilo.css).
import { esc } from "./nucleo.js";

const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

// Tarjeta de una cifra. Si lleva `ir`, es un botón que lleva a donde se arregla.
export function kpi({ valor, etiqueta, sub = "", tono = "", ir = "", id = "" }) {
  const cuerpo = `<span class="kpi-e">${esc(etiqueta)}</span><b class="kpi-v">${esc(valor)}</b>${
    sub ? `<small class="kpi-s">${esc(sub)}</small>` : ""}`;
  const clase = `kpi${tono ? " " + tono : ""}`;
  return ir
    ? `<button type="button" class="${clase}" data-ir="${esc(ir)}"${id ? ` id="${esc(id)}"` : ""}>${cuerpo}</button>`
    : `<div class="${clase}"${id ? ` id="${esc(id)}"` : ""}>${cuerpo}</div>`;
}

// `sec` dice en qué pestaña del dashboard del teléfono vive (resumen | graficas | gente)
export const panel = (titulo, cuerpo, nota = "", sec = "graficas") => `
  <section class="panel" data-s="${sec}">
    <h3>${esc(titulo)}</h3>${nota ? `<p class="panel-nota">${esc(nota)}</p>` : ""}
    ${cuerpo}
  </section>`;

// Anillo de proporciones. items: [{ etiqueta, valor, color }]; color es una variable CSS.
export function dona(items, centro = "", etiquetaCentro = "") {
  const total = items.reduce((n, i) => n + i.valor, 0);
  if (!total) return `<p class="vacio-chico">Todavía no hay datos.</p>`;
  let acum = 0;
  const arcos = items.filter(i => i.valor > 0).map(i => {
    const p = i.valor / total * 100;
    const arco = `<circle class="arco" cx="21" cy="21" r="15.9155" fill="none" stroke="var(${i.color})" stroke-width="5"
      stroke-dasharray="${p.toFixed(2)} ${(100 - p).toFixed(2)}" stroke-dashoffset="${(25 - acum).toFixed(2)}"/>`;
    acum += p;
    return arco;
  }).join("");
  const leyenda = items.map(i => `<li><i style="background:var(${i.color})"></i>${esc(i.etiqueta)}
    <b>${i.valor}</b><span>${Math.round(i.valor / total * 100)}%</span></li>`).join("");
  const texto = items.map(i => `${i.etiqueta}: ${i.valor}`).join(", ");
  return `<div class="dona">
    <div class="dona-aro" role="img" aria-label="${esc(texto)}">
      <svg viewBox="0 0 42 42" aria-hidden="true"><circle cx="21" cy="21" r="15.9155" fill="none"
        stroke="var(--rule-soft)" stroke-width="5"/>${arcos}</svg>
      <div class="dona-centro"><b>${esc(centro)}</b><span>${esc(etiquetaCentro)}</span></div>
    </div>
    <ul class="dona-ley">${leyenda}</ul></div>`;
}

// Barras horizontales ordenadas, para comparar categorías con nombres largos.
export function barrasH(items, { color = "--accent", vacio = "Todavía no hay datos." } = {}) {
  const max = Math.max(0, ...items.map(i => i.valor));
  if (!max) return `<p class="vacio-chico">${esc(vacio)}</p>`;
  return `<div class="hb">${items.map(i => `
    <div class="hb-f"><span class="hb-n" title="${esc(i.etiqueta)}">${esc(i.etiqueta)}</span>
      <span class="hb-b"><i style="width:${(i.valor / max * 100).toFixed(1)}%;background:var(${i.color || color})"></i></span>
      <b class="hb-v">${i.valor}</b></div>`).join("")}</div>`;
}

// Columnas en el tiempo. `cada` rotula una de cada n para que quepan en un teléfono.
export function columnas(items, { cada = 1, unidad = "hoja" } = {}) {
  const max = Math.max(0, ...items.map(i => i.valor));
  const total = items.reduce((n, i) => n + i.valor, 0);
  if (!total) return `<p class="vacio-chico">Todavía no hay datos en este periodo.</p>`;
  return `<div class="cols" role="img" aria-label="${esc(items.map(i => `${i.etiqueta}: ${i.valor}`).join(", "))}">${
    items.map((i, k) => `
    <div class="col" title="${esc(`${i.etiqueta}: ${plural(i.valor, unidad, unidad + "s")}`)}">
      <b>${i.valor || ""}</b>
      <span class="col-b"><i style="height:${i.valor ? Math.max(4, i.valor / max * 100).toFixed(1) : 0}%"></i></span>
      <small>${(items.length - 1 - k) % cada === 0 ? esc(i.etiqueta) : ""}</small>
    </div>`).join("")}</div>`;
}
