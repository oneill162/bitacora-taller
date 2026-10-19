import { PUNTOS, VEREDICTOS } from "./protocolo.js";
import { avance, haceCuanto, filasTaller as armarFilas, resumenTaller as armarResumen } from "./taller.js";
import { sb, $, estado, esc, hoy, val, aviso, explicar, esDeRed, conCorte, servidor, conectado } from "./nucleo.js";
import { barra } from "./router.js";
import { abrirAjena } from "./acceso.js";
import { entregar, loQueFalta } from "./editor.js";
import { tabla } from "./admin.js";

/* ================= tablero del día (instructor) ================= */
// La pregunta de la clase no es "qué se entregó" sino "quién no ha empezado",
// y esa no se puede contestar con la tabla de diagnósticos: el que no hizo
// nada no tiene fila. Por eso se pide la lista de estudiantes aparte y las
// hojas del día se cuelgan de ella. RLS deja al instructor leer los perfiles.
export async function cargarTaller(){
  if(!estado.taller) estado.taller = { fecha: hoy(), grupo: "", estudiantes: [], hojas: [] };
  const t = estado.taller;
  if(!conectado()){
    t.estudiantes = []; t.hojas = []; pintarTaller();
    aviso("El tablero del taller necesita conexión. Tus hojas sí están aquí.");
    return;
  }
  const [{ data: gente, error: e1 }, { data: hojas, error: e2 }] = await Promise.all([
    conCorte(sb.from("perfiles").select("id, usuario, nombre, grupo").eq("rol", "estudiante")),
    conCorte(sb.from("diagnosticos")
      .select("id, autor_id, orden, estado, veredicto, conteo, sistema, hallazgos, actualizado_en, equipos(serial, marca, modelo)")
      .eq("fecha", t.fecha))
  ]);
  if(e1 || e2){
    if(esDeRed(e1 || e2)) servidor.arriba = false;
    aviso(explicar(e1 || e2)); return;
  }
  t.estudiantes = (gente || []).sort((a, b) =>
    (a.nombre || a.usuario).localeCompare(b.nombre || b.usuario, "es"));
  t.hojas = hojas || [];
  aviso("");
  pintarTaller();
}

// El número exacto va al lado en texto (24/37); la barra es solo para poder
// barrer la lista con la vista y ver quién va atrás, así que se esconde de
// los lectores de pantalla en vez de repetirle el dato a nadie.
export function barraAvance(hechos, total){
  const pct = total ? Math.round((hechos / total) * 100) : 0;
  return `<span class="avance" aria-hidden="true"><i style="width:${pct}%"></i></span>`;
}

// Entregada: qué veredicto le salió. Sin entregar: cuándo la tocó por última
// vez, que es lo que dice si el estudiante sigue trabajando o se atascó.
export function marcaHoja(h){
  if(h.estado !== "entregado")
    return `<span class="cuando">${esc(haceCuanto(h.actualizado_en))}</span>`;
  const falta = loQueFalta(h);
  const pill = `<span class="pill" data-v="${esc(h.veredicto)}">${
    esc(VEREDICTOS[h.veredicto] || "Entregado")}</span>`;
  return falta.length
    ? pill + `<span class="pill falta-pill" title="${esc("Falta: " + falta.join(", "))}">! Falta</span>`
    : pill;
}

const hojaIncompleta = h => h.estado === "entregado" && loQueFalta(h).length > 0;

export function lineaHoja(h, sangrada){
  const a = avance(h, PUNTOS.length);
  const eq = h.equipos;
  return `
  <button class="hoja-linea${sangrada ? " sangrada" : ""}${hojaIncompleta(h) ? " fila-falta" : ""}" data-ajena="${h.id}">
    ${barraAvance(a.hechos, a.total)}
    <span class="quien-hoja">${sangrada ? esc(val(h.orden, "Otra hoja")) : ""}${
      eq ? `<small>${esc(eq.serial)}</small>` : ""}</span>
    <span class="cuenta">${a.hechos}/${a.total}</span>
    ${marcaHoja(h)}
  </button>`;
}

export function filasTaller(){
  const t = estado.taller;
  const filas = armarFilas(t.estudiantes, t.hojas, t.grupo);
  if(!filas.length) return `<p class="vacio-chico">No hay estudiantes registrados${
    t.grupo ? " en ese grupo" : ""}.</p>`;

  return filas.map(f => {
    const e = f.estudiante;
    const nombre = `<span class="quien-t"><b>${esc(val(e.nombre, e.usuario))}</b>${
      t.grupo ? "" : `<small>${esc(val(e.grupo, ""))}</small>`}</span>`;

    if(f.tipo === "sin") return `
      <div class="fila-t sin-empezar">
        ${barraAvance(0, PUNTOS.length)}${nombre}
        <span class="cuenta">—</span>
        <span class="cuando">sin empezar</span>
      </div>`;

    if(f.tipo === "varias") return `
      <div class="fila-t varias">
        ${nombre}
        <span class="cuando ancho">${f.hojas.length} hojas${
          f.entregadas ? ` · ${f.entregadas} entregada${f.entregadas === 1 ? "" : "s"}` : ""}</span>
      </div>` + f.hojas.map(x => lineaHoja(x, true)).join("");

    const h = f.hojas[0], a = avance(h, PUNTOS.length);
    return `
      <button class="fila-t${hojaIncompleta(h) ? " fila-falta" : ""}" data-ajena="${h.id}">
        ${barraAvance(a.hechos, a.total)}${nombre}
        <span class="cuenta">${a.hechos}/${a.total}</span>
        ${marcaHoja(h)}
      </button>`;
  }).join("");
}

export function resumenTaller(){
  const t = estado.taller;
  const r = armarResumen(t.estudiantes, t.hojas, t.grupo);
  if(!r.total) return "";
  return `${r.empezaron} de ${r.total} empezaron · ${r.entregaron} ${
    r.entregaron === 1 ? "entregó" : "entregaron"}`;
}

// Enlaza solo dentro de su contenedor: el tablero y la tabla se repintan por
// separado, y enlazar sobre todo el documento duplicaría los manejadores.
export function enlazarAjenas(raiz){
  raiz?.querySelectorAll("[data-ajena]").forEach(b => {
    b.addEventListener("click", () => abrirAjena(b.dataset.ajena));
    b.addEventListener("keydown", ev => {
      if(ev.key === "Enter" || ev.key === " "){ ev.preventDefault(); abrirAjena(b.dataset.ajena); }
    });
  });
}

export function pintarTaller(){
  pintarGrupos();
  const cuerpo = $("#taller-cuerpo");
  if(cuerpo){ cuerpo.innerHTML = filasTaller(); enlazarAjenas(cuerpo); }
  const res = $("#taller-resumen");
  if(res) res.textContent = resumenTaller();
}

// La vista se dibuja antes de que lleguen los estudiantes, así que cuando se
// pintó el <select> todavía no se sabía qué grupos hay. Hay que rellenarlo al
// llegar los datos, conservando lo que el instructor tuviera escogido.
export function pintarGrupos(){
  const sel = $("#ta-grupo");
  if(!sel) return;
  const grupos = [...new Set((estado.taller?.estudiantes || []).map(e => e.grupo).filter(Boolean))].sort();
  const actuales = [...sel.options].slice(1).map(o => o.value);
  if(actuales.join("|") === grupos.join("|")) return;
  const escogido = estado.taller?.grupo || "";
  sel.innerHTML = `<option value="">Todos</option>` +
    grupos.map(g => `<option${g === escogido ? " selected" : ""}>${esc(g)}</option>`).join("");
  // si el grupo escogido desapareció de la lista, no puede quedar filtrando a ciegas
  if(escogido && !grupos.includes(escogido)) estado.taller.grupo = "";
}
