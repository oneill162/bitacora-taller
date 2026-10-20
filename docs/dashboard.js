// El dashboard: lo primero que se ve al entrar.
//
// Dos pantallas, no una con partes escondidas:
//   estudiante  su trabajo y qué hacer ahora (sale del teléfono: sirve sin señal)
//   instructor  el taller entero: gente, equipos, inventario y dónde intervenir
//               (necesita conexión: el trabajo de los demás no se guarda aquí)
import { PUNTOS } from "./protocolo.js";
import { $, app, estado, esc, hoy, fechaLarga, val, aviso, conectado } from "./nucleo.js";
import { resumenEstudiante, resumenTaller } from "./resumen.js";
import { kpi, panel, dona, barrasH, columnas } from "./graficas.js";
import { cargarDatos } from "./admin.js";
import { abrir } from "./editor.js";
import { nuevoDiagnostico } from "./acceso.js";
import { irA } from "./router.js";

const primerNombre = p => String(p.nombre || p.usuario || "").trim().split(/\s+/)[0] || "";
const hojas = n => `${n} ${n === 1 ? "hoja" : "hojas"}`;

export function vistaInicio(){
  const p = estado.perfil;
  return p.rol === "instructor" ? vistaInstructorInicio(p) : vistaEstudianteInicio(p);
}

/* ================= estudiante ================= */
function vistaEstudianteInicio(p){
  const r = resumenEstudiante(estado.lista, PUNTOS.length);
  const pend = r.pendientes.length;
  const vacia = r.hojas === 0;

  const acciones = `
    <button class="btn" id="d-nuevo">Nuevo diagnóstico</button>
    ${r.borradorReciente ? `<button class="btn ghost" id="d-borrador" data-id="${esc(r.borradorReciente.id)}">Continuar borrador</button>` : ""}
    <button class="btn ghost" data-nav="panel">Mis diagnósticos</button>`;

  if(vacia) return `
  <div class="pila inicio">
    <div class="enc"><div><h1>Hola, ${esc(primerNombre(p))}</h1><p>${esc(fechaLarga(hoy()))}</p></div></div>
    <div id="aviso" hidden></div>
    <div class="vacio bienvenida">
      <h2>Empieza tu primer diagnóstico</h2>
      <p>Cada hoja que entregues aparecerá aquí con tus avances, tus veredictos y tu nota.</p>
      <button class="btn" id="d-nuevo">Nuevo diagnóstico</button>
    </div>
  </div>`;

  const tarjetas = [
    kpi({ valor: r.hojas, etiqueta: "Hojas", sub: `${r.entregadas} ${r.entregadas === 1 ? "entregada" : "entregadas"}`, ir: "panel" }),
    kpi({ valor: r.borradores, etiqueta: "En borrador", sub: r.borradores ? "Sin entregar" : "Al día", ir: "panel" }),
    kpi({ valor: pend, etiqueta: "Por completar", sub: pend ? "Entregadas a medias" : "Todo completo",
          tono: pend ? "alerta" : "", ir: pend ? "panel" : "" }),
    kpi({ valor: r.notaMedia ?? "—", etiqueta: "Nota media", sub: r.calificadas.length ? `${r.calificadas.length} ${r.calificadas.length === 1 ? "calificada" : "calificadas"}` : "Aún sin calificar" })
  ].join("");

  const pendientes = pend ? `
    <section class="panel alerta-panel">
      <h3><b class="exclama">!</b> Completa estas hojas</h3>
      <p class="panel-nota">No entran al informe final hasta que tengan todos sus datos.</p>
      <ul class="lista-acc">${r.pendientes.map(x => `
        <li><span><b>${esc(val(x.hoja.equipos?.serial, "Sin serial"))}</b>
          <small>${esc(x.falta.join(", "))}</small></span>
          <button class="btn ghost chico" data-abrir="${esc(x.hoja.id)}">Completar</button></li>`).join("")}</ul>
    </section>` : "";

  const recientes = `
    <ul class="lista-acc">${r.recientes.map(h => `
      <li><span><b>${esc(val(h.equipos?.serial, h.orden || "Hoja"))}</b>
        <small>${esc(fechaLarga(h.fecha))} · ${h.estado === "entregado" ? esc(h.veredicto || "entregada") : "borrador"}${
          h.nota != null ? ` · nota ${esc(h.nota)}` : ""}</small></span>
        <button class="btn ghost chico" data-abrir="${esc(h.id)}">Abrir</button></li>`).join("")}</ul>`;

  const pts = r.puntos;
  return `
  <div class="pila inicio">
    <div class="enc">
      <div><h1>Hola, ${esc(primerNombre(p))}</h1><p>${esc(fechaLarga(hoy()))} · tu trabajo en ${hojas(r.hojas)}</p></div>
      <div class="fila">${acciones}</div>
    </div>
    <div id="aviso" hidden></div>
    <section class="kpis">${tarjetas}</section>
    ${pendientes}
    <div class="paneles">
      ${panel("Tus veredictos", dona([
          { etiqueta: "Apto", valor: r.veredictos.apto, color: "--ok" },
          { etiqueta: "Con observaciones", valor: r.veredictos.obs, color: "--obs" },
          { etiqueta: "No apto", valor: r.veredictos.no, color: "--bad" }], r.entregadas, "entregadas"))}
      ${panel("Tu actividad", columnas(r.semanas, { cada: 2, unidad: "hoja" }), "Hojas por semana, últimas 8")}
      ${panel("Puntos evaluados", barrasH([
          { etiqueta: "Bien", valor: pts.ok, color: "--ok" },
          { etiqueta: "Observación", valor: pts.obs, color: "--obs" },
          { etiqueta: "Falla", valor: pts.falla, color: "--bad" },
          { etiqueta: "No aplica", valor: pts.na, color: "--ink-3" }]), "Suma de todas tus hojas")}
      ${panel("Lo más reciente", recientes)}
    </div>
  </div>`;
}

/* ================= instructor ================= */
function vistaInstructorInicio(p){
  return `
  <div class="pila inicio">
    <div class="enc">
      <div><h1>Panel del taller</h1><p>${esc(fechaLarga(hoy()))} · ${esc(val(p.escuela, "Taller de tecnología"))}</p></div>
      <div class="fila">
        <button class="btn" data-ir="hoy">El día</button>
        <button class="btn ghost" data-ir="informes">Informes</button>
        <button class="btn ghost" data-ir="inventario">Inventario</button>
        <button class="btn ghost" data-ir="gente">Gente</button>
        <button class="btn ghost" id="d-codigo">Código QR</button>
      </div>
    </div>
    <div id="aviso" hidden></div>
    <div id="dash-cuerpo"><p class="vacio-chico">Cargando el taller…</p></div>
  </div>`;
}

function cuerpoInstructor(t, p){
  const soySuper = p.es_superusuario === true;
  const tarjetas = [
    kpi({ valor: t.estudiantes, etiqueta: "Estudiantes", sub: t.sinHojas ? `${t.sinHojas} sin empezar` : "Todos han trabajado", ir: "gente" }),
    kpi({ valor: t.entregadas, etiqueta: "Entregadas", sub: `${t.entregadasHoy} hoy`, ir: "informes:todo" }),
    kpi({ valor: t.equipos, etiqueta: "Equipos", sub: `${t.equiposDistintos} distintos`, ir: "inventario" }),
    kpi({ valor: t.incompletos, etiqueta: "Incompletos", sub: t.incompletos ? "Fuera del informe final" : "Todo completo",
          tono: t.incompletos ? "alerta" : "", ir: "informes:incompletos" }),
    kpi({ valor: t.sinCalificar, etiqueta: "Sin calificar", sub: t.notaMedia != null ? `Media ${t.notaMedia}` : "Sin notas aún", ir: "informes:todo" }),
    ...(soySuper ? [kpi({ valor: t.solicitudes, etiqueta: "Piden ser instructor", sub: t.solicitudes ? "Esperan tu aprobación" : "Ninguna",
          tono: t.solicitudes ? "aviso" : "", ir: "gente" })] : [])
  ].join("");

  return `
    <section class="kpis">${tarjetas}</section>
    <div class="paneles">
      ${panel("Entregas, últimos 14 días", columnas(t.dias, { cada: 2, unidad: "entrega" }))}
      ${panel("Veredictos", dona([
          { etiqueta: "Apto", valor: t.veredictos.apto, color: "--ok" },
          { etiqueta: "Con observaciones", valor: t.veredictos.obs, color: "--obs" },
          { etiqueta: "No apto", valor: t.veredictos.no, color: "--bad" }], t.entregadas, "entregadas"))}
      ${panel("Quién trabaja más", barrasH(t.topEstudiantes, { vacio: "Aún no hay estudiantes." }), "Hojas por estudiante")}
      ${panel("Qué se les olvida", barrasH(t.motivos, { color: "--bad", vacio: "Nada incompleto." }), "Faltantes en hojas y equipos incompletos")}
      ${panel("Equipos por salón", barrasH(t.porSalon, { vacio: "Aún no hay equipos." }))}
      ${panel("Equipos por marca", barrasH(t.porMarca, { vacio: "Aún no hay equipos." }))}
    </div>
    <section class="panel">
      <h3>Usuarios registrados</h3>
      <div class="filtros no-print">
        <label class="f">Buscar<input id="d-buscar" placeholder="nombre, usuario o grupo"></label>
        <button class="btn ghost chico" data-ir="gente">Gestionar en Gente</button>
      </div>
      <div id="d-usuarios">${tablaUsuarios(estado.datos, "")}</div>
    </section>`;
}

function tablaUsuarios(d, q){
  const t = q.trim().toLowerCase();
  const ultima = id => d.diagnosticos.filter(h => h.autor_id === id).map(h => String(h.fecha).slice(0, 10)).sort().pop() || "—";
  const filas = Object.values(d.porId)
    .filter(u => !t || `${u.nombre} ${u.usuario} ${u.grupo}`.toLowerCase().includes(t))
    .sort((a, b) => String(a.nombre || a.usuario).localeCompare(String(b.nombre || b.usuario), "es"))
    .map(u => `<tr>
      <td>${esc(u.nombre || u.usuario)}<small class="sub-td">${esc(u.usuario)}</small></td>
      <td>${esc(u.grupo || "—")}</td>
      <td>${u.es_superusuario ? "Superusuario" : u.rol === "instructor" ? "Instructor" : "Estudiante"}${
        u.solicita_instructor && u.rol !== "instructor" ? ' <span class="pill" data-v="obs">Pide ser instructor</span>' : ""}</td>
      <td>${esc(u.email || "—")}</td>
      <td class="num">${d.diagnosticos.filter(h => h.autor_id === u.id).length}</td>
      <td class="num">${esc(ultima(u.id))}</td></tr>`).join("");
  if(!filas) return `<p class="vacio-chico">Nadie coincide con esa búsqueda.</p>`;
  return `<div class="tabla-envoltura"><table class="datos">
    <thead><tr><th>Nombre</th><th>Grupo</th><th>Rol</th><th>Correo</th><th>Hojas</th><th>Última</th></tr></thead>
    <tbody>${filas}</tbody></table></div>`;
}

/* ================= montaje ================= */
// "informes:incompletos" → pestaña informes, informe incompletos
const irPestana = clave => {
  const [pestana, informe] = clave.split(":");
  return irA("instructor", { pestana, informe });
};

export async function montarInicio(){
  $("#d-nuevo")?.addEventListener("click", nuevoDiagnostico);
  $("#d-borrador")?.addEventListener("click", ev => abrir(ev.currentTarget.dataset.id));
  app.querySelectorAll("[data-abrir]").forEach(b => b.onclick = () => abrir(b.dataset.abrir));

  const enlazarIr = () => app.querySelectorAll("[data-ir]").forEach(b => {
    b.onclick = () => b.dataset.ir === "panel" ? irA("panel") : irPestana(b.dataset.ir);
  });
  enlazarIr();
  $("#d-codigo")?.addEventListener("click", () => irA("codigo"));

  if(estado.perfil.rol !== "instructor") return;
  const caja = $("#dash-cuerpo");
  if(!conectado()){
    caja.innerHTML = `<p class="vacio-chico">El panel del taller necesita conexión: el trabajo de los demás no se guarda en este equipo.</p>`;
    return;
  }
  if(!(await cargarDatos())){ caja.innerHTML = ""; return; }
  if(estado.vista !== "inicio") return;                 // se fue a otra pantalla mientras cargaba
  caja.innerHTML = cuerpoInstructor(resumenTaller(estado.datos, PUNTOS.length), estado.perfil);
  enlazarIr();
  $("#d-buscar")?.addEventListener("input", ev => {
    $("#d-usuarios").innerHTML = tablaUsuarios(estado.datos, ev.target.value);
  });
  aviso("");
}
