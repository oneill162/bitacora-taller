import { SUPABASE_URL, SUPABASE_ANON } from "./config.js";
import { PUNTOS } from "./protocolo.js";
import * as local from "./local.js";
import { barra } from "./router.js";
import { guardar } from "./editor.js";


// supabase-js lo carga index.html desde docs/vendor/, no desde un CDN: en un
// taller sin señal no se puede depender de que se baje una librería.
const { createClient } = window.supabase;

export const sb = createClient(SUPABASE_URL, SUPABASE_ANON);
export const $ = s => document.querySelector(s);
export const app = $("#app");

export const estado = {
  perfil: null,     // { id, usuario, nombre, grupo, escuela, rol }
  vista: "acceso",  // acceso | panel | editor | reporte | instructor
  diag: null,       // diagnóstico abierto
  puntos: {},       // { clave: {estado, nota} }
  equipo: null,     // equipo enlazado
  lista: [],
  autor: null,      // de quién es la hoja abierta; el instructor lee las ajenas
  ajena: false,     // la hoja abierta no es mía: se mira, no se toca
  taller: null,     // tablero del día: { fecha, grupo, estudiantes, hojas }
  pestana: "hoy",   // qué mira el instructor: hoy | todo
  codigoClase: "",  // el código de registro vigente, solo lo lee el instructor
  datos: null,      // todo lo del taller para informes: { estudiantes, equipos, diagnosticos }
  informe: "estudiante",
  latido: null,     // refresco automático del tablero
  pendiente: null,  // timeout de autoguardado
  enLinea: true,    // navigator.onLine, para pintarlo en la barra
  porSubir: 0       // cuánto guardó el equipo que Supabase todavía no tiene
};

// grupo y título de cada punto, para poder guardarlos sin señal sin
// tener que buscarlos en PUNTOS cada vez
export const META_PUNTOS = Object.fromEntries(
  PUNTOS.map(p => [p.clave, { grupo: p.grupo, titulo: p.titulo }]));

/* ================= utilidades ================= */
export const esc = s => String(s ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
export const hoy = () => new Date().toISOString().slice(0,10);
export const MESES = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
export function fechaLarga(iso){
  if(!iso) return "—";
  const [a,m,d] = iso.split("-");
  return `${Number(d)} de ${MESES[Number(m)-1]} de ${a}`;
}
export const val = (v, alt="—") => (v && String(v).trim()) ? String(v).trim() : alt;
export const ETQ = { ok:"BIEN", obs:"OBS.", falla:"FALLA", na:"N/A", "":"—" };

export function aviso(msg, tipo="error"){
  const zona = $("#aviso");
  if(!zona) return;
  zona.className = tipo;
  zona.textContent = msg;
  zona.hidden = !msg;
}

// Traduce los errores de Supabase a algo que un estudiante entienda.
export function explicar(err){
  const m = (err?.message || String(err)).toLowerCase();
  if(m.includes("invalid login credentials")) return "Usuario o contraseña incorrectos.";
  if(m.includes("email not confirmed")) return "La cuenta existe pero falta activarla. Avisa al instructor.";
  if(m.includes("already registered") || m.includes("already been registered")) return "Ese usuario ya está tomado. Escoge otro.";
  if(m.includes("password should be at least")) return "La contraseña necesita al menos 6 caracteres.";
  if(m.includes("failed to fetch") || m.includes("networkerror")) return "Sin conexión. Revisa el internet y vuelve a intentar.";
  if(m.includes("row-level security")) return "No tienes permiso para hacer ese cambio.";
  return err?.message || "Algo salió mal. Intenta de nuevo.";
}

// Distingue "no hay internet" de "el servidor dijo que no". Lo primero se
// aguanta en silencio, que para eso está el guardado local; lo segundo hay
// que enseñarlo.
export function esDeRed(err){
  const m = (err?.message || String(err || "")).toLowerCase();
  return m.includes("failed to fetch") || m.includes("networkerror")
      || m.includes("load failed") || m.includes("network request failed");
}

/* ================= conexión y subida ================= */
// Una consulta a Supabase puede quedarse colgada para siempre cuando el wifi
// está conectado pero no sale a ningún lado: la librería reintenta por dentro
// y nunca se rinde. Sin este corte la app se queda en "Cargando la bitácora"
// hasta que el estudiante la cierre. El corte devuelve un error con la misma
// forma que devolvería Supabase, así que quien llama no tiene que enterarse.
export const CORTE = 10000;
export const conCorte = (consulta, ms = CORTE) => Promise.race([
  consulta,
  new Promise(ok => setTimeout(
    () => ok({ data:null, error:{ message:"Failed to fetch: Supabase no contestó a tiempo." } }), ms))
]);

// navigator.onLine dice si hay wifi. servidor.arriba dice si Supabase de verdad
// contesta, que en la escuela no es lo mismo: el wifi del plantel conecta y
// no sale a ningún lado. Solo se apaga cuando algo falla de verdad, y se
// vuelve a encender para reintentar; así una sola llamada fallida evita que
// las siguientes se queden esperando el corte completo.
export const servidor = { arriba: true };
export const conectado = () => navigator.onLine && servidor.arriba;

export async function supabaseResponde(){
  if(!navigator.onLine){ servidor.arriba = false; return false; }
  try{
    // cualquier respuesta sirve, hasta un 401: lo que se mide es si llega
    await fetch(`${SUPABASE_URL}/auth/v1/health`,
                { cache:"no-store", signal: AbortSignal.timeout(4000) });
    servidor.arriba = true;
    return true;
  } catch(_){ servidor.arriba = false; return false; }
}

export function textoConexion(){
  const n = estado.porSubir || 0;
  if(!estado.enLinea) return n ? `Sin conexión · ${n} por subir` : "Sin conexión";
  return n ? `${n} por subir` : "";
}

export function pintarConexion(){
  const el = $("#conexion");
  if(!el) return;
  const t = textoConexion();
  el.textContent = t;
  el.hidden = !t;
  el.dataset.off = estado.enLinea ? "" : "1";
}

// Intenta llevarle a Supabase todo lo que el equipo tiene guardado y no ha
// subido. Se llama al guardar, al recuperar la señal y cada tanto.
export async function empujar(marca){
  const r = await local.sincronizar(sb, conectado());
  estado.porSubir = r.pendientes;
  if(r.error && esDeRed(r.error)) servidor.arriba = false;
  else if(r.hablo && !r.error) servidor.arriba = true;
  estado.enLinea = conectado();
  pintarConexion();
  if(marca) marca.textContent = r.pendientes === 0 ? "Guardado" : "Guardado en este equipo";
  if(r.error && !esDeRed(r.error)) aviso(explicar(r.error));
  return r;
}

// Marca de "falta información": el signo va en el texto para que no dependa solo del rojo.
export const ICONO_FALTA = '<b class="exclama" aria-label="Incompleto">!</b>';
