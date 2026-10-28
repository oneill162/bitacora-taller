import { NOMBRE_TALLER } from "./config.js";
import * as local from "./local.js";
import { sb, $, app, estado, esc, hoy, aviso, explicar, conCorte, servidor, conectado, supabaseResponde, pintarConexion, empujar } from "./nucleo.js";
import { vistaAcceso, montarAcceso, cargarLista, vistaPanel, montarPanel, nuevoDiagnostico } from "./acceso.js";
import { vistaEditor, montarEditor, vistaReporte, montarReporte, guardar, loQueFalta } from "./editor.js";
import { cargarTaller } from "./tablero.js";
import { vistaInstructor, montarInstructor } from "./admin.js";
import { vistaCodigo, montarCodigo, cargarCodigoClase } from "./codigo.js";
import { vistaInicio, montarInicio } from "./dashboard.js";
import { RECINTOS, recintoActual, aplicarRecinto, selectorRecinto, tilesRecinto, sincronizarConPerfil, soltarPendiente, prepararEntradas, soltarEntradas } from "./campus.js";

/* ================= arranque ================= */
export async function iniciar(){
  estado.enLinea = navigator.onLine;
  servidor.arriba = navigator.onLine;

  let sesion = null;
  try { sesion = (await sb.auth.getSession()).data.session; } catch(_){}

  if(sesion){
    await cargarPerfil(sesion.user.id);
  } else {
    // Sin señal el token no se puede renovar y Supabase devuelve sesión nula.
    // Con el perfil guardado en el equipo la app abre igual y el estudiante
    // sigue trabajando; lo suyo sube cuando vuelva el internet.
    const guardado = await local.leerMeta("perfil");
    if(guardado && !(await supabaseResponde())) await usarPerfil(guardado);
    else estado.vista = "acceso";
  }
  pintar();
  if(estado.perfil) empujar();

  addEventListener("online", () => {
    servidor.arriba = true; estado.enLinea = true; pintarConexion();
    if(estado.perfil) empujar($("#r-guardado"));
  });
  addEventListener("offline", () => {
    servidor.arriba = false; estado.enLinea = false; pintarConexion();
  });
  // "Salir" desde la hoja de recinto del teléfono (campus.js avisa con este evento)
  document.addEventListener("bitacora:salir", salir);

  // El evento "online" miente cuando el wifi está pero no pasa tráfico.
  // Reintentar cada medio minuto cubre esa señal de taller que va y viene:
  // se vuelve a dar por buena la conexión y que el intento diga la verdad.
  setInterval(() => {
    if(estado.perfil && estado.porSubir){ servidor.arriba = true; empujar(); }
  }, 30000);

  sb.auth.onAuthStateChange(async (evt, ses) => {
    if(evt === "SIGNED_OUT"){
      clearInterval(estado.latido); estado.latido = null;
      estado.perfil = null; estado.lista = []; estado.porSubir = 0;
      estado.datos = null; estado.taller = null; estado.ajena = false; estado.autor = null;
      estado.vista = "acceso"; pintar();
    }
  });
}

export async function cargarPerfil(id, reintento = 0){
  const { data, error } = await conCorte(sb.from("perfiles").select("*").eq("id", id).maybeSingle());
  if(error){
    const guardado = await local.leerMeta("perfil");
    if(guardado?.id === id){ await usarPerfil(guardado); return; }
    aviso(explicar(error)); return;
  }
  // el perfil lo crea un trigger; en el primer registro puede tardar un instante
  if(!data && reintento < 3){
    await new Promise(r => setTimeout(r, 400));
    return cargarPerfil(id, reintento + 1);
  }
  if(!data){ aviso("No aparece tu perfil. Avisa al instructor."); return; }
  await local.guardarMeta("perfil", data);
  await usarPerfil(data);
}

export async function usarPerfil(p){
  estado.perfil = p;
  sincronizarConPerfil(p);          // el recinto del perfil manda; si no tiene, se queda el de este equipo
  estado.vista = "inicio";
  await cargarLista();
}

// Al salir se borra lo guardado en este equipo: las máquinas del taller se
// comparten y el trabajo de uno no puede quedar en la sesión del que sigue.
// Por eso primero se intenta subir, y si algo queda pendiente se pregunta.
export async function salir(){
  const r = await local.sincronizar(sb, conectado());
  if(r.pendientes > 0 && !confirm(
      `Quedan ${r.pendientes} cosas guardadas en este equipo que todavía no suben a la bitácora. ` +
      `Si sales ahora se pierden. ¿Salir de todas formas?`)) return;
  await local.olvidarTodo();
  soltarPendiente();
  try { await sb.auth.signOut(); }
  catch(_){ estado.perfil = null; estado.lista = []; estado.porSubir = 0;
            estado.vista = "acceso"; pintar(); }
}

/* ================= chasis: barra, navegación de abajo, pie ================= */
const IC = {
  inicio: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v10h13V10"/>',
  hojas: '<path d="M7 3h10v18H7z"/><path d="M10 8h4M10 12h4M10 16h2"/>',
  taller: '<path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z"/>',
  nuevo: '<path d="M12 5v14M5 12h14"/>',
  salir: '<path d="M10 4H5v16h5M15 8l4 4-4 4M19 12H9"/>',
  luna: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
  sol: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6"/>'
};
const svg = n => `<svg viewBox="0 0 24 24" aria-hidden="true">${IC[n]}</svg>`;

// La hoja entregada con datos sin llenar: el número que sale en la insignia de Mis hojas.
const incompletas = () => (estado.lista || []).filter(d => d.estado === "entregado" && loQueFalta(d).length).length;
const insignia = n => n ? `<span class="insignia" aria-hidden="true">${n}</span><span class="sr">${n === 1 ? "1 hoja incompleta" : n + " hojas incompletas"}</span>` : "";

const NAV = { inicio: ["inicio"], panel: ["panel", "editor"], instructor: ["instructor", "codigo"] };
function seccionActiva(){
  return estado.vista === "reporte" ? (estado.ajena ? "instructor" : "panel")
    : Object.keys(NAV).find(k => NAV[k].includes(estado.vista));
}
function rolTexto(p){
  if(p.es_superusuario) return "Superusuario";
  if(p.rol === "instructor") return "Instructor";
  return "Estudiante" + (p.grupo ? " · " + p.grupo : "");
}

export function barra(){
  const p = estado.perfil;
  const r = RECINTOS[recintoActual()];
  const sel = selectorRecinto({ conSalir: !!p });
  const activa = seccionActiva();
  const marca = (p ? `<a class="marca-app" href="#inicio" data-nav="inicio" aria-label="Bitácora de diagnóstico, inicio">` : `<div class="marca-app">`) + `
        <span class="sello"><img src="img/itpr-marca.webp" alt="${p ? "" : "Instituto Tecnológico de Puerto Rico"}" width="28" height="33"></span>
        <span class="marca-t"><b>Bitácora<span class="mas"> de diagnóstico</span></b><small>${esc(NOMBRE_TALLER)} · <span data-r="nombre">${esc(r.nombre)}</span></small></span>` + (p ? `</a>` : `</div>`);
  const link = (k, t, extra = "") => `<a href="#${k}" data-nav="${k}"${activa === k ? ' aria-current="page"' : ""}>${t}${extra}</a>`;
  const nav = p ? `<nav class="nav-p" aria-label="Secciones">${link("inicio", "Inicio")}${link("panel", "Mis hojas", insignia(incompletas()))}${
    p.rol === "instructor" ? link("instructor", "El taller") : ""}</nav>` : "";
  return `
  <header class="barra campo no-print">
    <a class="salto" href="#principal">Saltar al contenido</a>
    <div class="in barra-in">
      ${marca}
      ${nav}
      ${p ? `<span class="conexion" id="conexion" hidden></span>` : ""}
      <div class="acciones">
        ${sel.html}
        <button class="ic-btn ic-modo" type="button" data-modo-btn aria-label="Modo oscuro" aria-pressed="false">
          <svg class="luna" viewBox="0 0 24 24" aria-hidden="true">${IC.luna}</svg><svg class="sol" viewBox="0 0 24 24" aria-hidden="true">${IC.sol}</svg></button>
        ${p ? `<div class="quien"><b>${esc(p.nombre || p.usuario)}</b><small>${esc(rolTexto(p))}</small></div>
        <button class="btn chico sec solo-esc" type="button" id="b-salir">Salir</button>` : ""}
      </div>
    </div>
  </header>`;
}

// La navegación de abajo (teléfono). Es el ÚLTIMO hijo de #app y es sticky, no fixed: #app es un contenedor.
function navBaja(){
  const p = estado.perfil;
  if(!p) return "";
  const activa = seccionActiva();
  const a = (k, t, extra = "") => `<li><a href="#${k}" data-nav="${k}"${activa === k ? ' aria-current="page"' : ""}>${svg(k === "panel" ? "hojas" : k === "instructor" ? "taller" : k)}<span>${t}</span>${extra}</a></li>`;
  return `<nav class="nav-baja no-print" aria-label="Principal"><ul>
    ${a("inicio", "Inicio")}
    ${a("panel", "Mis hojas", insignia(incompletas()))}
    ${p.rol === "instructor" ? a("instructor", "El taller")
      : `<li><button type="button" class="nav-nuevo" data-accion="nuevo">${svg("nuevo")}<span>Nuevo</span></button></li>`}
    <li><button type="button" data-accion="salir">${svg("salir")}<span>Salir</span></button></li>
  </ul></nav>`;
}

// El pie lleva el aval del Departamento de Educación en toda pantalla que no sea el editor.
function pie(){
  const r = RECINTOS[recintoActual()];
  const tiles = tilesRecinto({ pie: true });
  return `
  <footer class="cap pie campo-oscuro no-print" data-nombre="${esc(r.pie)}">
    <div class="in pie-in">
      <div class="aval rev">
        <h2 class="h2">Con el aval del Departamento de Educación</h2>
        <p>Bitácora de la División Técnica y Vocacional del Instituto Tecnológico de Puerto Rico, en los recintos de San Juan y Manatí.</p>
        <div class="placas-pie">
          <div class="placa-campus">
            <img class="pc-itpr" src="img/itpr-marca.webp" alt="Instituto Tecnológico de Puerto Rico" width="320" height="374">
            <img class="pc-sanjuan" src="img/tiburon.webp" alt="Tiburones, Recinto de San Juan" width="538" height="560">
            <img class="pc-manati" src="img/itpr-manati.webp" alt="Instituto Tecnológico de Puerto Rico, Manatí" width="800" height="365">
          </div>
          <div class="placa-depr"><img src="img/depr.webp" alt="Departamento de Educación, Gobierno de Puerto Rico" width="1000" height="323" loading="lazy"></div>
        </div>
      </div>
      ${tiles.html}
      <div class="pie-legal"><span>© ${new Date().getFullYear()} División Técnica y Vocacional · ITPR</span></div>
    </div>
  </footer>`;
}

// A dónde lleva cada botón de navegación. Salir del editor guarda antes: el
// autoguardado espera 800 ms y no se puede perder lo escrito en ese rato.
export async function irA(destino, opc = {}){
  if(estado.vista === "editor"){ clearTimeout(estado.pendiente); await guardar(); }
  clearInterval(estado.latido); estado.latido = null;
  estado.ajena = false; estado.autor = estado.perfil; estado.diag = null;
  aviso("");
  if(destino === "inicio"){ estado.vista = "inicio"; pintar(); return; }
  if(destino === "panel"){ await cargarLista(); estado.vista = "panel"; pintar(); return; }
  if(destino === "codigo"){
    estado.vista = "codigo"; pintar();
    await cargarCodigoClase();
    if(estado.codigoClase) pintar();
    return;
  }
  // el taller del instructor
  estado.pestana = opc.pestana || "hoy";
  if(opc.informe) estado.informe = opc.informe;
  if(!estado.taller) estado.taller = { fecha: hoy(), grupo: "", estudiantes: [], hojas: [] };
  estado.vista = "instructor"; pintar(); await cargarTaller();
}

// "Nuevo" de la navegación de abajo: lo mismo que el botón Nuevo diagnóstico de Mis hojas.
async function irANuevo(){
  clearInterval(estado.latido); estado.latido = null;
  estado.ajena = false; estado.autor = estado.perfil;
  aviso("");
  await nuevoDiagnostico();
}

function montarChasis(){
  $("#b-salir")?.addEventListener("click", salir);
  app.querySelectorAll("[data-nav]").forEach(b => b.onclick = ev => { ev.preventDefault(); irA(b.dataset.nav); });
  app.querySelectorAll('[data-accion="salir"]').forEach(b => b.onclick = salir);
  app.querySelectorAll('[data-accion="nuevo"]').forEach(b => b.onclick = irANuevo);
}

export function pintar(){
  const vistas = { acceso: vistaAcceso, inicio: vistaInicio, panel: vistaPanel, editor: vistaEditor,
                   reporte: vistaReporte, instructor: vistaInstructor, codigo: vistaCodigo };
  const enEditor = estado.vista === "editor";
  const enAcceso = estado.vista === "acceso";      // la entrada trae su propia cabecera y su aval
  soltarEntradas();
  app.dataset.vista = estado.vista;
  app.innerHTML = (enAcceso ? "" : barra()) + `<main id="principal" tabindex="-1" data-vista="${estado.vista}">` + vistas[estado.vista]() + "</main>"
    + (enEditor || enAcceso ? "" : pie()) + (enEditor ? "" : navBaja());
  montarChasis();
  aplicarRecinto(recintoActual(), { recordar: false });   // textos, aria y color de la barra del sistema al día con lo recién pintado
  ({ acceso: montarAcceso, inicio: montarInicio, panel: montarPanel, editor: montarEditor,
     reporte: montarReporte, instructor: montarInstructor, codigo: montarCodigo })[estado.vista]();
  pintarConexion();
  prepararEntradas(app);
  window.scrollTo(0, 0);
}
