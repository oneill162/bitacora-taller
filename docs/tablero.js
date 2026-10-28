import { PUNTOS } from "./protocolo.js";
import { avance, haceCuanto, filasTaller as armarFilas, resumenTaller as armarResumen } from "./taller.js";
import { sb, $, estado, esc, hoy, val, aviso, explicar, esDeRed, conCorte, servidor, conectado } from "./nucleo.js";
import { abrirAjena } from "./acceso.js";
import { loQueFalta } from "./editor.js";
import { chipEstado, glifo } from "./campus.js";

/* ================= tablero del día (instructor) ================= */
// La pregunta de la clase no es "qué se entregó" sino "quién no ha empezado",
// y esa no se puede contestar con la tabla de diagnósticos: el que no hizo
// nada no tiene fila. Por eso se pide la lista de estudiantes aparte y las
// hojas del día se cuelgan de ella. RLS deja al instructor leer los perfiles.
let pedido = 0;   // cada carga lleva su número: si al volver ya hay otra más nueva, la vieja se descarta (la wifi del taller las desordena)
export async function cargarTaller(){
  if(!estado.taller) estado.taller = { fecha: hoy(), grupo: "", estudiantes: [], hojas: [] };
  const t = estado.taller, fecha = t.fecha, mio = ++pedido;
  if(!conectado()){
    t.estudiantes = []; t.hojas = []; t.cargado = false; t.fallo = "Sin conexión: el tablero no se puede cargar."; pintarTaller();
    aviso("El tablero del taller necesita conexión. Tus hojas sí están aquí.");
    return;
  }
  const [{ data: gente, error: e1 }, { data: hojas, error: e2 }] = await Promise.all([
    conCorte(sb.from("perfiles").select("id, usuario, nombre, grupo").eq("rol", "estudiante")),
    conCorte(sb.from("diagnosticos")
      .select("id, autor_id, orden, estado, veredicto, conteo, sistema, hallazgos, actualizado_en, equipos(serial, marca, modelo)")
      .eq("fecha", fecha))
  ]);
  if(mio !== pedido) return;
  if(e1 || e2){
    if(esDeRed(e1 || e2)) servidor.arriba = false;
    if(!cargadoHoy(t)){ t.fallo = "No se pudo cargar el tablero."; pintarTaller(); }   // sin datos de este día, no dejar el "Cargando…" puesto
    aviso(explicar(e1 || e2)); return;
  }
  t.estudiantes = (gente || []).sort((a, b) =>
    (a.nombre || a.usuario).localeCompare(b.nombre || b.usuario, "es"));
  t.hojas = hojas || [];
  t.cargado = true; t.cargadoFecha = fecha; t.fallo = "";
  aviso("");
  pintarTaller();
}

// ¿Ya llegaron los estudiantes y las hojas de la fecha que se está viendo? Antes de eso, el tablero no puede decir "0".
const cargadoHoy = t => !!t.cargado && t.cargadoFecha === t.fecha;

const hojaIncompleta = h => h.estado === "entregado" && loQueFalta(h).length > 0;

// El veredicto con el que se pinta una hoja en el tablero: borrador, incompleta
// (que tapa al veredicto: no entra al informe final) o el veredicto de la hoja.
const estadoHoja = h =>
  h.estado !== "entregado" ? "bor" :
  hojaIncompleta(h) ? "inc" :
  ["apto", "obs", "no"].includes(h.veredicto) ? h.veredicto : "";

// Con qué filtros del tablero coincide una hoja. Cada hoja cae en uno solo (entregada, incompleta o en progreso),
// igual que las cifras del mosaico: el filtro "Entregadas" lista lo mismo que cuenta la cifra "Entregadas".
const marcasFiltro = h => {
  const v = estadoHoja(h);
  return v === "bor" ? ["bor"] : v === "inc" ? ["inc"] : ["ent"];
};

const iniciales = n => String(n || "").trim().split(/\s+/).slice(0, 2).map(p => p[0]).join("").toUpperCase();

// La barra solo sirve para barrer la lista con la vista y ver quién va atrás; el
// número exacto va al lado en texto (24/37), así que se esconde de los lectores
// de pantalla. Su extremo está cortado a 30° (el corte del sistema).
export function barraAvance(hechos, total){
  const pct = total ? Math.round((hechos / total) * 100) : 0;
  return `<span class="t-av${hechos ? "" : " nada"}" aria-hidden="true"><i style="width:${pct}%"></i></span>`;
}

// Entregada: qué veredicto le salió y, si está incompleta, qué le falta.
// Sin entregar: cuándo la tocó por última vez, que es lo que dice si el
// estudiante sigue trabajando o se atascó.
export function marcaHoja(h){
  const v = estadoHoja(h);
  if(v === "bor") return `${chipEstado("bor")}<span>${esc(haceCuanto(h.actualizado_en))}</span>`;
  if(v === "inc") return `${chipEstado("inc")}<span>Falta ${esc(loQueFalta(h).join(", "))}</span>`;
  return v ? chipEstado(v) : `<span class="estado">Entregada</span>`;
}

const quienEs = (nombre, aparte) => `
  <span class="t-q"><span class="chapa" aria-hidden="true">${esc(iniciales(nombre))}</span>
    <span class="t-n"><b>${esc(nombre)}</b>${aparte ? `<small>${esc(aparte)}</small>` : ""}</span></span>`;

export function lineaHoja(h, sangrada, n = 0){
  const a = avance(h, PUNTOS.length);
  const eq = h.equipos;
  const v = estadoHoja(h);
  const nombre = sangrada ? val(h.orden, "Otra hoja") : val(eq?.serial, "Hoja");
  const aparte = sangrada ? val(eq?.serial, "Otra hoja del mismo estudiante") : "";
  return `
  <button type="button" class="t-fila fila-v${sangrada ? " sub" : ""}" data-v="${esc(v)}" data-ajena="${esc(h.id)}" style="--n:${n}">
    ${barraAvance(a.hechos, a.total)}
    <span class="t-q"><span class="t-n"><b>${esc(nombre)}</b>${aparte ? `<small>${esc(aparte)}</small>` : ""}</span></span>
    <span class="t-c">${a.hechos}<small>/${a.total}</small></span>
    <span class="t-m">${marcaHoja(h)}</span>
  </button>`;
}

// Las filas ya armadas (taller.js) con su marca de filtro: para el HTML y para contar.
function filasConMarcas(){
  const t = estado.taller;
  return armarFilas(t.estudiantes, t.hojas, t.grupo).map(f => ({
    ...f,
    marcas: f.tipo === "sin" ? ["sin"] : [...new Set(f.hojas.flatMap(marcasFiltro))]
  }));
}

export function filasTaller(){
  const t = estado.taller;
  if(!cargadoHoy(t)) return `<p class="vacio-t" role="status">${esc(t.fallo || "Cargando el taller…")}</p>`;
  const todas = filasConMarcas();
  if(!todas.length) return `<p class="vacio-t">No hay estudiantes registrados${t.grupo ? " en ese grupo" : ""}.</p>`;
  const f = t.filtro || "todo";
  const filas = f === "todo" ? todas : todas.filter(x => x.marcas.includes(f));
  if(!filas.length) return `<p class="vacio-t">Nadie en esta vista${t.grupo ? " del grupo " + esc(t.grupo) : ""}.</p>`;

  let n = 0;
  return filas.map(fila => {
    const e = fila.estudiante;
    const nombre = val(e.nombre, e.usuario);
    const aparte = t.grupo ? "" : val(e.grupo, "");
    const k = Math.min(n++, 10);

    if(fila.tipo === "sin") return `
      <div class="t-fila" data-v="sin" style="--n:${k}">
        ${barraAvance(0, PUNTOS.length)}${quienEs(nombre, aparte)}
        <span class="t-c">—</span>
        <span class="t-m">Sin empezar</span>
      </div>`;

    if(fila.tipo === "varias"){
      const hojas = f === "todo" ? fila.hojas : fila.hojas.filter(h => marcasFiltro(h).includes(f));
      return `
      <div class="t-fila varias" style="--n:${k}">
        ${quienEs(nombre, aparte)}
        <span class="t-m">${fila.hojas.length} hojas${
          fila.entregadas ? ` · ${fila.entregadas} entregada${fila.entregadas === 1 ? "" : "s"}` : ""}</span>
      </div>` + hojas.map(h => lineaHoja(h, true, Math.min(n++, 10))).join("");
    }

    const h = fila.hojas[0], a = avance(h, PUNTOS.length), eq = h.equipos;
    const detalle = [aparte, eq?.serial].filter(Boolean).join(" · ");
    return `
      <button type="button" class="t-fila fila-v" data-v="${esc(estadoHoja(h))}" data-ajena="${esc(h.id)}" style="--n:${k}">
        ${barraAvance(a.hechos, a.total)}${quienEs(nombre, detalle)}
        <span class="t-c">${a.hechos}<small>/${a.total}</small></span>
        <span class="t-m">${marcaHoja(h)}</span>
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

// El mosaico de cifras del día: hojas entregadas, incompletas y en progreso, y estudiantes sin empezar.
export function mosaicoDia(){
  const t = estado.taller || { estudiantes: [], hojas: [], grupo: "" };
  const gente = new Set(armarFilas(t.estudiantes, t.hojas, t.grupo).map(f => f.estudiante.id));
  const hojas = t.hojas.filter(h => gente.has(h.autor_id));
  const sin = armarFilas(t.estudiantes, t.hojas, t.grupo).filter(f => f.tipo === "sin").length;
  const inc = hojas.filter(hojaIncompleta).length;
  const ent = hojas.filter(h => h.estado === "entregado").length - inc;
  const bor = hojas.filter(h => h.estado !== "entregado").length;
  const n = x => cargadoHoy(t) ? x : "—";                 // antes de cargar no se sabe: un 0 diría "clase vacía"
  return `
    <div class="rd"><b>${n(ent)}</b><span>Entregadas</span></div>
    <div class="rd inc"><b>${n(inc)}</b><span>${glifo("inc")}Incompletas</span></div>
    <div class="rd"><b>${n(bor)}</b><span>En progreso</span></div>
    <div class="rd"><b>${n(sin)}</b><span>Sin empezar</span></div>`;
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

export function pintarFiltros(){
  const f = estado.taller?.filtro || "todo";
  document.querySelectorAll("#filtros-dia [data-f]").forEach(b =>
    b.setAttribute("aria-pressed", String(b.dataset.f === f)));
}

// `entrar`: que las filas lleguen escalonadas (la primera vez que hay datos y al cambiar de filtro).
// El refresco de cada 30 segundos repinta en silencio: nada se mueve mientras el instructor camina por el taller.
export function pintarTaller(entrar = false){
  pintarGrupos();
  pintarFiltros();
  const cuerpo = $("#taller-cuerpo");
  if(cuerpo){
    const primera = estado.taller?.cargado && !cuerpo.dataset.listo;
    if(estado.taller?.cargado) cuerpo.dataset.listo = "1";
    cuerpo.classList.toggle("entra", !!(entrar || primera));
    cuerpo.innerHTML = filasTaller();
    enlazarAjenas(cuerpo);
  }
  const mosaico = $("#resumen-dia");
  if(mosaico) mosaico.innerHTML = mosaicoDia();
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
