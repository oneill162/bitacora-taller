// El dashboard: lo primero que se ve al entrar.
//
// Dos pantallas, no una con partes escondidas:
//   estudiante  su trabajo y qué hacer ahora (sale del teléfono: sirve sin señal)
//   instructor  el taller entero: gente, equipos, inventario y dónde intervenir
//               (necesita conexión: el trabajo de los demás no se guarda aquí)
//
// Cada pantalla es una pila de capítulos (.cap) directos de <main>. En el teléfono las secciones (data-s)
// se ven de una en una según el data-sec del contenedor .inicio; en tableta y escritorio se ven todas.
import { PUNTOS } from "./protocolo.js";
import { $, app, estado, esc, hoy, fechaLarga, val, aviso, conectado } from "./nucleo.js";
import { resumenEstudiante, resumenTaller } from "./resumen.js";
import { kpi, graf, dona, barrasH, columnas } from "./graficas.js";
import { cargarDatos } from "./admin.js";
import { abrir } from "./editor.js";
import { nuevoDiagnostico } from "./acceso.js";
import { irA } from "./router.js";
import { RECINTOS, recintoActual, glifo, chipEstado, ilustracion, placaHero, lemaHero, prepararEntradas } from "./campus.js";

const primerNombre = p => String(p.nombre || p.usuario || "").trim().split(/\s+/)[0] || "";
const hojas = n => `${n} ${n === 1 ? "hoja" : "hojas"}`;
const flecha = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>`;
const mas = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>`;

// Pestañas del teléfono. Las secciones válidas dependen de la pantalla: un estudiante no tiene "Gente".
const pestanasMovil = secciones => `
  <div class="tabs-m" role="group" aria-label="Secciones del panel">${secciones.map(([k, t]) => `
    <button type="button" data-sec="${k}" aria-pressed="${seccionActual(secciones) === k}">${t}</button>`).join("")}</div>`;
const seccionActual = secciones => secciones.some(([k]) => k === estado.seccion) ? estado.seccion : "resumen";

// El héroe de las dos pantallas: título en dos renglones enmascarados (con un espacio entre ellos para que se lea de corrido).
const heroInicio = ({ id, l1, l2, sub, acciones, clase }) => `
  <section class="cap hero campo ${clase}" aria-labelledby="${id}">
    ${ilustracion()}
    <div class="in hero-in">
      <div class="hero-txt">
        ${lemaHero()}
        <h1 class="h1" id="${id}"><span class="linea"><span>${l1}</span></span> <span class="linea"><span>${l2}</span></span></h1>
        <p class="hero-sub rev">${sub}</p>
        <div class="hero-acc rev">${acciones}</div>
      </div>
    </div>
    ${placaHero()}
  </section>`;
// #aviso lo usa aviso() de nucleo.js; vive dentro de un .in para respetar el margen lateral
const zonaAviso = `<div class="in"><div id="aviso" hidden role="status"></div></div>`;

export function vistaInicio(){
  const p = estado.perfil;
  return p.rol === "instructor" ? vistaInstructorInicio(p) : vistaEstudianteInicio(p);
}

/* ================= estudiante ================= */
function vistaEstudianteInicio(p){
  const r = resumenEstudiante(estado.lista, PUNTOS.length);
  const pend = r.pendientes.length;
  const nombre = esc(primerNombre(p));

  if(r.hojas === 0) return `
  <div class="inicio lienzo" data-sec="resumen">
    ${heroInicio({ id: "h-est", clase: "hero-chico est-hero", l1: "Hola,", l2: nombre, sub: esc(fechaLarga(hoy())),
      acciones: `<button class="btn marca-b" type="button" id="d-nuevo">Nuevo diagnóstico${mas}</button>` })}
    ${zonaAviso}
    <section class="cap bienvenida" aria-labelledby="h-bien">
      <div class="in">
        <h2 class="h2 rev" id="h-bien">Empieza tu primer diagnóstico</h2>
        <p class="rev">Cada hoja que entregues aparecerá aquí con tus avances, tus veredictos y tu nota.</p>
        <button class="btn rev" type="button" data-nuevo>Nuevo diagnóstico${mas}</button>
      </div>
    </section>
  </div>`;

  const acciones = `
    <button class="btn marca-b" type="button" id="d-nuevo">Nuevo diagnóstico${mas}</button>
    ${r.borradorReciente ? `<button class="btn sec" type="button" id="d-borrador" data-id="${esc(r.borradorReciente.id)}">Continuar borrador</button>` : ""}
    <button class="btn sec solo-esc" type="button" data-ir="panel">Mis diagnósticos</button>`;   // en el teléfono ya está "Mis hojas" abajo

  const tarjetas = [
    kpi({ valor: r.hojas, etiqueta: "Hojas", sub: `${r.entregadas} ${r.entregadas === 1 ? "entregada" : "entregadas"}`, ir: "panel", clase: "kpi-prim" }),
    kpi({ valor: r.borradores, etiqueta: "En borrador", sub: r.borradores ? "Sin entregar" : "Al día", ir: "panel" }),
    kpi({ valor: pend, etiqueta: "Por completar", sub: pend ? "Entregadas a medias" : "Todo completo",
          tono: pend ? "alerta" : "", ic: pend ? "inc" : "", ir: pend ? "panel" : "" }),
    kpi({ valor: r.notaMedia ?? "—", etiqueta: "Nota media", sub: r.calificadas.length
          ? `${r.calificadas.length} ${r.calificadas.length === 1 ? "calificada" : "calificadas"}` : "Aún sin calificar" })
  ].join("");

  const alerta = pend ? `
    <section class="cap alerta-cap alerta-panel" data-s="resumen" aria-labelledby="h-falta">
      <div class="in">
        <div class="alerta-cab rev">
          ${glifo("inc")}
          <div><h2 class="h2" id="h-falta">${pend === 1 ? "Completa esta hoja" : `Completa estas ${pend} hojas`}</h2>
            <p>No entran al informe final hasta que tengan todos sus datos.</p></div>
        </div>
        <ul class="lista-acc rev">${r.pendientes.map(x => `
          <li class="acc"><div><b>${esc(val(x.hoja.equipos?.serial, "Sin serial"))}${
              x.hoja.equipos?.marca || x.hoja.equipos?.modelo ? ` · ${esc(`${x.hoja.equipos.marca || ""} ${x.hoja.equipos.modelo || ""}`.trim())}` : ""}</b>
            <small>Falta ${esc(x.falta.join(", "))}</small></div>
            <button class="btn chico tenue" type="button" data-abrir="${esc(x.hoja.id)}">Completar</button>
            ${chipEstado("inc")}</li>`).join("")}</ul>
      </div>
    </section>` : "";

  const incompletas = new Set(r.pendientes.map(x => x.hoja.id));
  const recientes = r.recientes.map(h => {
    const v = h.estado !== "entregado" ? "bor" : incompletas.has(h.id) ? "inc"
      : ["apto", "obs", "no"].includes(h.veredicto) ? h.veredicto : "";
    return `
      <button type="button" class="rec fila-v rev" data-v="${v || "sin"}" data-abrir="${esc(h.id)}">
        <span><b>${esc(val(h.equipos?.serial, h.orden || "Hoja"))}</b><small>${esc(fechaLarga(h.fecha))}${v ? "" : " · entregada"}</small></span>
        <span class="nota">${h.nota != null ? `${esc(h.nota)}<small> /100</small>` : ""}</span>
        ${v ? chipEstado(v) : ""}
      </button>`;
  }).join("");

  const pts = r.puntos;
  return `
  <div class="inicio lienzo" data-sec="${seccionActual([["resumen"], ["graficas"]])}">
    ${heroInicio({ id: "h-est", clase: "hero-chico est-hero", l1: "Hola,", l2: nombre,
      sub: `${esc(fechaLarga(hoy()))} · tu trabajo en ${hojas(r.hojas)}`, acciones })}
    ${zonaAviso}
    ${pestanasMovil([["resumen", "Resumen"], ["graficas", "Gráficas"]])}
    <section class="cap" data-s="resumen" aria-label="Tus cifras"><div class="kpis kpis-est">${tarjetas}</div></section>
    ${alerta}
    <section class="cap recientes" data-s="resumen" aria-labelledby="h-rec">
      <div class="in">
        <h2 class="h2 rev" id="h-rec">Lo más reciente</h2>
        <div class="rec-lista">${recientes}</div>
      </div>
    </section>
    <section class="cap campo-s2 graf-sec" data-s="graficas" aria-labelledby="h-estg">
      <div class="in">
        <h2 class="h2 rev" id="h-estg">Tu trabajo en gráficas</h2>
        <div class="graf-rejilla">
          ${graf("Tus veredictos", dona([
              { etiqueta: "Apto", valor: r.veredictos.apto, v: "apto" },
              { etiqueta: "Con observaciones", valor: r.veredictos.obs, v: "obs" },
              { etiqueta: "No apto", valor: r.veredictos.no, v: "no" }], r.entregadas, "entregadas"),
            `De tus ${hojas(r.entregadas)} entregadas`)}
          ${graf("Tu actividad", columnas(r.semanas, { cada: 2, unidad: "hoja", ultima: "esta semana" }), "Hojas por semana, últimas 8; la marcada es esta semana")}
          ${graf("Puntos evaluados", barrasH([
              { etiqueta: "Bien", valor: pts.ok, v: "apto" },
              { etiqueta: "Observación", valor: pts.obs, v: "obs" },
              { etiqueta: "Falla", valor: pts.falla, v: "no" },
              { etiqueta: "No aplica", valor: pts.na, v: "na" }]), "Suma de todas tus hojas")}
        </div>
      </div>
    </section>
  </div>`;
}

/* ================= instructor ================= */
function vistaInstructorInicio(p){
  const acciones = `
    <button class="btn marca-b btn-dia" type="button" data-ir="hoy">El día${flecha}</button>
    <button class="btn sec" type="button" data-ir="informes">Informes</button>
    <button class="btn sec" type="button" data-ir="inventario">Inventario</button>
    <button class="btn sec" type="button" data-ir="gente">Gente</button>
    <button class="btn sec" type="button" id="d-codigo">Código QR</button>`;
  return `
  <div class="inicio lienzo" data-sec="${seccionActual([["resumen"], ["graficas"], ["gente"]])}">
    ${heroInicio({ id: "h-ins", clase: "ins-hero", l1: "Panel del", l2: "taller",
      sub: `${esc(fechaLarga(hoy()))} · <span data-r="largo">${esc(RECINTOS[recintoActual()].largo)}</span>`, acciones })}
    ${zonaAviso}
    ${pestanasMovil([["resumen", "Resumen"], ["graficas", "Gráficas"], ["gente", "Gente"]])}
    <div id="dash-cuerpo"><p class="vacio-chico vacio-carga">Cargando el taller…</p></div>
  </div>`;
}

const leyendaEstados = `
  <div class="kpi kpi-leyenda rev"><h3>Cómo leer los estados</h3><ul>
    <li data-v="apto">${glifo("apto")}<span>Apto: círculo con visto</span></li>
    <li data-v="obs">${glifo("obs")}<span>Observación: triángulo</span></li>
    <li data-v="no">${glifo("no")}<span>No apto: cuadrado con equis</span></li>
    <li data-v="inc">${glifo("inc")}<span>Incompleto: círculo discontinuo</span></li></ul></div>`;

function cuerpoInstructor(t, p){
  const soySuper = p.es_superusuario === true;
  const tarjetas = [
    kpi({ valor: t.entregadas, etiqueta: "Entregadas", fuerte: t.entregadasHoy,
          sub: `hoy · ${t.estudiantes} ${t.estudiantes === 1 ? "estudiante" : "estudiantes"}`, ir: "informes:todo", grande: true }),
    kpi({ valor: t.estudiantes, etiqueta: "Estudiantes", sub: t.sinHojas ? `${t.sinHojas} sin empezar` : "Todos han trabajado", ir: "gente" }),
    kpi({ valor: t.equipos, etiqueta: "Equipos", sub: `${t.equiposDistintos} distintos`, ir: "inventario" }),
    kpi({ valor: t.incompletos, etiqueta: "Incompletos", sub: t.incompletos ? "Fuera del informe final" : "Todo completo",
          tono: t.incompletos ? "alerta" : "", ic: t.incompletos ? "inc" : "", ir: "informes:incompletos" }),
    kpi({ valor: t.sinCalificar, etiqueta: "Sin calificar", sub: t.notaMedia != null ? `Media ${t.notaMedia}` : "Sin notas aún", ir: "informes:todo" }),
    ...(soySuper ? [kpi({ valor: t.solicitudes, etiqueta: "Piden ser instructor", sub: t.solicitudes ? "Esperan tu aprobación" : "Ninguna",
          tono: t.solicitudes ? "info" : "", ic: t.solicitudes ? "info" : "", ir: "gente" })] : []),
    leyendaEstados
  ].join("");

  return `
    <section class="cap" data-s="resumen" aria-label="Cifras del taller">
      <div class="kpis${soySuper ? "" : " sin-piden"}">${tarjetas}</div>
    </section>
    <section class="cap campo-s2 graf-sec" data-s="graficas" aria-labelledby="h-graf">
      <div class="in">
        <h2 class="h2 rev" id="h-graf">Cómo va el taller</h2>
        <p class="suave rev">Entregas, veredictos y lo que más se les olvida a los estudiantes.</p>
        <div class="graf-rejilla">
          ${graf("Veredictos", dona([
              { etiqueta: "Apto", valor: t.veredictos.apto, v: "apto" },
              { etiqueta: "Con observaciones", valor: t.veredictos.obs, v: "obs" },
              { etiqueta: "No apto", valor: t.veredictos.no, v: "no" }], t.entregadas, "entregadas"),
            `De las ${t.entregadas} hojas entregadas`, "graf-a")}
          ${graf("Entregas, últimos 14 días", columnas(t.dias, { cada: 2, unidad: "entrega", ultima: "hoy" }),
            "Una columna por día; la marcada es hoy", "graf-b")}
          ${graf("Quién trabaja más", barrasH(t.topEstudiantes, { vacio: "Aún no hay estudiantes." }), "Hojas por estudiante")}
          ${graf("Qué se les olvida", barrasH(t.motivos, { mal: true, vacio: "Nada incompleto." }), "Faltantes en hojas y equipos incompletos")}
          ${graf("Equipos", `<p class="nota">Por salón</p>${barrasH(t.porSalon, { vacio: "Aún no hay equipos." })}
            <p class="nota nota-2">Por marca</p>${barrasH(t.porMarca, { vacio: "Aún no hay equipos." })}`)}
        </div>
      </div>
    </section>
    <section class="cap tabla-sec" id="gente" data-s="gente" aria-labelledby="h-gente">
      <div class="in">
        <div class="tabla-cab">
          <div><h2 class="h2 rev" id="h-gente">Usuarios registrados</h2>
            <p class="rev">${conteoGente(t)}</p></div>
          <div class="buscar no-print rev">
            <label class="campo-f">Buscar<input id="d-buscar" type="search" placeholder="Nombre, usuario o grupo" autocomplete="off"></label>
            <button class="btn tenue" type="button" data-ir="gente">Gestionar en Gente</button>
          </div>
        </div>
        <div id="d-usuarios">${tablaUsuarios(estado.datos, "")}</div>
      </div>
    </section>`;
}

const cuentaDe = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;
const conteoGente = t => `${cuentaDe(t.estudiantes, "estudiante", "estudiantes")}, ${cuentaDe(t.instructores, "instructor", "instructores")}${
  t.solicitudes ? ` y ${cuentaDe(t.solicitudes, "solicitud", "solicitudes")} por aprobar` : ""}.`;

const rolDe = u => u.es_superusuario ? "Superusuario" : u.rol === "instructor" ? "Instructor" : "Estudiante";

function tablaUsuarios(d, q){
  const t = q.trim().toLowerCase();
  const ultima = id => d.diagnosticos.filter(h => h.autor_id === id).map(h => String(h.fecha).slice(0, 10)).sort().pop() || "—";
  const gente = Object.values(d.porId)
    .filter(u => !t || `${u.nombre} ${u.usuario} ${u.grupo}`.toLowerCase().includes(t))
    .sort((a, b) => String(a.nombre || a.usuario).localeCompare(String(b.nombre || b.usuario), "es"));
  if(!gente.length) return `<p class="vacio-chico">Nadie coincide con esa búsqueda.</p>`;
  const filas = gente.map(u => `<tr>
      <td class="primera"><b>${esc(u.nombre || u.usuario)}</b><small>${esc(u.usuario)}</small></td>
      <td data-l="Grupo">${esc(u.grupo || "—")}</td>
      <td class="rol-celda" data-l="Rol"><span class="chip rol">${rolDe(u)}</span>${
        u.solicita_instructor && u.rol !== "instructor" ? ` <span class="chip">${glifo("info")}Pide ser instructor</span>` : ""}</td>
      <td class="sec">${esc(u.email || "—")}</td>
      <td class="n num" data-l="Hojas">${d.diagnosticos.filter(h => h.autor_id === u.id).length}</td>
      <td class="n num sec">${esc(ultima(u.id))}</td></tr>`).join("");
  return `<div class="tabla-env"><table class="datos apila usuarios">
    <caption class="sr">Usuarios registrados</caption>
    <thead><tr><th scope="col">Nombre</th><th scope="col">Grupo</th><th scope="col">Rol</th><th scope="col">Correo</th><th scope="col" class="n">Hojas</th><th scope="col" class="n">Última</th></tr></thead>
    <tbody>${filas}</tbody></table></div>`;
}

/* ================= la cifra que sube ================= */
// Una vez, cuando la tarjeta entra en pantalla (los mismos umbrales que el IntersectionObserver del chasis, así no hay un
// destello con la cifra final). Se salta con "reducir movimiento" y bajo automatización (las pruebas leen las cifras ya puestas).
// Sin este script las cifras están escritas en el HTML.
const subir = el => {
  const fin = Number(el.dataset.cuenta), t0 = performance.now(), D = 720;
  const paso = t => {
    const p = Math.min(1, (t - t0) / D);
    el.textContent = p < 1 ? Math.round(fin * (1 - Math.pow(1 - p, 3))) : fin;
    if(p < 1) requestAnimationFrame(paso);
  };
  el.textContent = 0;
  requestAnimationFrame(paso);
};
let ioCifras;                                           // uno solo: al repintar se suelta lo que seguía de la pantalla anterior
function contarCifras(raiz){
  ioCifras?.disconnect();
  if(matchMedia("(prefers-reduced-motion: reduce)").matches || navigator.webdriver || !("IntersectionObserver" in window)) return;
  const io = ioCifras = new IntersectionObserver(es => es.forEach(e => {
    if(!e.isIntersecting) return;
    io.unobserve(e.target);
    const n = e.target.querySelector("[data-cuenta]");
    if(n) subir(n);
  }), { threshold: .14, rootMargin: "0px 0px -4% 0px" });
  raiz.querySelectorAll("[data-cuenta]").forEach(n => io.observe(n.closest(".kpi")));   // sin :has(), que Firefox viejo y algunos WebView no entienden
}

/* ================= montaje ================= */
// "informes:incompletos" → pestaña informes, informe incompletos
const irPestana = clave => {
  const [pestana, informe] = clave.split(":");
  return irA("instructor", { pestana, informe });
};

export async function montarInicio(){
  const lienzo = $(".inicio");
  app.querySelectorAll(".tabs-m button").forEach(b => b.onclick = () => {
    estado.seccion = b.dataset.sec;
    lienzo.dataset.sec = b.dataset.sec;
    app.querySelectorAll(".tabs-m button").forEach(x => x.setAttribute("aria-pressed", String(x === b)));
  });
  $("#d-nuevo")?.addEventListener("click", nuevoDiagnostico);
  app.querySelectorAll("[data-nuevo]").forEach(b => b.addEventListener("click", nuevoDiagnostico));
  $("#d-borrador")?.addEventListener("click", ev => abrir(ev.currentTarget.dataset.id));
  app.querySelectorAll("[data-abrir]").forEach(b => b.onclick = () => abrir(b.dataset.abrir));

  const enlazarIr = () => app.querySelectorAll("[data-ir]").forEach(b => {
    b.onclick = () => b.dataset.ir === "panel" ? irA("panel") : irPestana(b.dataset.ir);
  });
  enlazarIr();
  $("#d-codigo")?.addEventListener("click", () => irA("codigo"));

  if(estado.perfil.rol !== "instructor"){ contarCifras(lienzo); return; }
  const caja = $("#dash-cuerpo");
  if(!conectado()){
    caja.innerHTML = `<p class="vacio-chico vacio-carga">El panel del taller necesita conexión: el trabajo de los demás no se guarda en este equipo.</p>`;
    return;
  }
  if(!(await cargarDatos())){ caja.innerHTML = ""; return; }
  if(estado.vista !== "inicio") return;                 // se fue a otra pantalla mientras cargaba
  caja.innerHTML = cuerpoInstructor(resumenTaller(estado.datos, PUNTOS.length), estado.perfil);
  enlazarIr();
  $("#d-buscar")?.addEventListener("input", ev => {
    $("#d-usuarios").innerHTML = tablaUsuarios(estado.datos, ev.target.value);
  });
  prepararEntradas(caja);                               // lo recién insertado entra con el mismo movimiento que el resto
  contarCifras(caja);
  aviso("");
}
