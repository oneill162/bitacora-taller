import { NOMBRE_TALLER } from "./config.js";
import * as local from "./local.js";
import { sb, $, app, estado, esc, hoy, aviso, explicar, conCorte, servidor, conectado, supabaseResponde, pintarConexion, empujar } from "./nucleo.js";
import { vistaAcceso, montarAcceso, cargarLista, vistaPanel, montarPanel } from "./acceso.js";
import { vistaEditor, montarEditor, vistaReporte, montarReporte, guardar } from "./editor.js";
import { cargarTaller } from "./tablero.js";
import { vistaInstructor, montarInstructor } from "./admin.js";
import { vistaCodigo, montarCodigo, cargarCodigoClase } from "./codigo.js";
import { vistaInicio, montarInicio } from "./dashboard.js";

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
  try { await sb.auth.signOut(); }
  catch(_){ estado.perfil = null; estado.lista = []; estado.porSubir = 0;
            estado.vista = "acceso"; pintar(); }
}

/* ================= router ================= */
export function barra(){
  const p = estado.perfil;
  return `
  <header class="barra no-print"><div class="barra-in">
    <div class="marca"><strong>Bitácora de Diagnóstico</strong><span>${esc(NOMBRE_TALLER)}</span></div>
    ${p ? `<span class="conexion" id="conexion" hidden></span>
      <div class="quien"><b>${esc(p.nombre || p.usuario)}</b>${esc(p.usuario)}${
      p.rol === "instructor" ? " · instructor" : ""}</div>
      <button class="btn ghost chico" id="b-salir">Salir</button>` : ""}
  </div>${navegacion()}</header>`;
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

const NAV = { inicio: ["inicio"], panel: ["panel", "editor"], instructor: ["instructor", "codigo"] };
function navegacion(){
  const p = estado.perfil;
  if(!p) return "";
  const activa = estado.vista === "reporte" ? (estado.ajena ? "instructor" : "panel")
    : Object.keys(NAV).find(k => NAV[k].includes(estado.vista));
  const b = (k, t) => `<button type="button" class="nav-b" data-nav="${k}"${activa === k ? ' aria-current="page"' : ""}>${t}</button>`;
  return `<nav class="nav no-print" aria-label="Secciones"><div class="nav-in">${b("inicio", "Inicio")}${
    b("panel", "Mis diagnósticos")}${p.rol === "instructor" ? b("instructor", "El taller") : ""}</div></nav>`;
}

export function pintar(){
  const vistas = { acceso: vistaAcceso, inicio: vistaInicio, panel: vistaPanel, editor: vistaEditor,
                   reporte: vistaReporte, instructor: vistaInstructor, codigo: vistaCodigo };
  app.innerHTML = barra() + "<main>" + vistas[estado.vista]() + "</main>";
  $("#b-salir")?.addEventListener("click", salir);
  app.querySelectorAll("[data-nav]").forEach(b => b.onclick = () => irA(b.dataset.nav));
  ({ acceso: montarAcceso, inicio: montarInicio, panel: montarPanel, editor: montarEditor,
     reporte: montarReporte, instructor: montarInstructor, codigo: montarCodigo })[estado.vista]();
  pintarConexion();
  window.scrollTo(0, 0);
}
