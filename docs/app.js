import { SUPABASE_URL, SUPABASE_ANON, DOMINIO_LOGIN, NOMBRE_TALLER } from "./config.js";
import { GRUPOS, PUNTOS, ESTADOS, VEREDICTOS, resumir } from "./protocolo.js";
import * as local from "./local.js";
import { avance, haceCuanto, filasTaller as armarFilas, resumenTaller as armarResumen } from "./taller.js";
import * as inf from "./informes.js";

// supabase-js lo carga index.html desde docs/vendor/, no desde un CDN: en un
// taller sin señal no se puede depender de que se baje una librería.
const { createClient } = window.supabase;

const sb = createClient(SUPABASE_URL, SUPABASE_ANON);
const $ = s => document.querySelector(s);
const app = $("#app");

const estado = {
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
const META_PUNTOS = Object.fromEntries(
  PUNTOS.map(p => [p.clave, { grupo: p.grupo, titulo: p.titulo }]));

/* ================= utilidades ================= */
const esc = s => String(s ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
const hoy = () => new Date().toISOString().slice(0,10);
const MESES = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
function fechaLarga(iso){
  if(!iso) return "—";
  const [a,m,d] = iso.split("-");
  return `${Number(d)} de ${MESES[Number(m)-1]} de ${a}`;
}
const val = (v, alt="—") => (v && String(v).trim()) ? String(v).trim() : alt;
const ETQ = { ok:"BIEN", obs:"OBS.", falla:"FALLA", na:"N/A", "":"—" };

function aviso(msg, tipo="error"){
  const zona = $("#aviso");
  if(!zona) return;
  zona.className = tipo;
  zona.textContent = msg;
  zona.hidden = !msg;
}

// Traduce los errores de Supabase a algo que un estudiante entienda.
function explicar(err){
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
function esDeRed(err){
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
const CORTE = 10000;
const conCorte = (consulta, ms = CORTE) => Promise.race([
  consulta,
  new Promise(ok => setTimeout(
    () => ok({ data:null, error:{ message:"Failed to fetch: Supabase no contestó a tiempo." } }), ms))
]);

// navigator.onLine dice si hay wifi. hayServidor dice si Supabase de verdad
// contesta, que en la escuela no es lo mismo: el wifi del plantel conecta y
// no sale a ningún lado. Solo se apaga cuando algo falla de verdad, y se
// vuelve a encender para reintentar; así una sola llamada fallida evita que
// las siguientes se queden esperando el corte completo.
let hayServidor = true;
const conectado = () => navigator.onLine && hayServidor;

async function supabaseResponde(){
  if(!navigator.onLine){ hayServidor = false; return false; }
  try{
    // cualquier respuesta sirve, hasta un 401: lo que se mide es si llega
    await fetch(`${SUPABASE_URL}/auth/v1/health`,
                { cache:"no-store", signal: AbortSignal.timeout(4000) });
    hayServidor = true;
    return true;
  } catch(_){ hayServidor = false; return false; }
}

function textoConexion(){
  const n = estado.porSubir || 0;
  if(!estado.enLinea) return n ? `Sin conexión · ${n} por subir` : "Sin conexión";
  return n ? `${n} por subir` : "";
}

function pintarConexion(){
  const el = $("#conexion");
  if(!el) return;
  const t = textoConexion();
  el.textContent = t;
  el.hidden = !t;
  el.dataset.off = estado.enLinea ? "" : "1";
}

// Intenta llevarle a Supabase todo lo que el equipo tiene guardado y no ha
// subido. Se llama al guardar, al recuperar la señal y cada tanto.
async function empujar(marca){
  const r = await local.sincronizar(sb, conectado());
  estado.porSubir = r.pendientes;
  if(r.error && esDeRed(r.error)) hayServidor = false;
  else if(r.hablo && !r.error) hayServidor = true;
  estado.enLinea = conectado();
  pintarConexion();
  if(marca) marca.textContent = r.pendientes === 0 ? "Guardado" : "Guardado en este equipo";
  if(r.error && !esDeRed(r.error)) aviso(explicar(r.error));
  return r;
}

/* ================= arranque ================= */
async function iniciar(){
  estado.enLinea = navigator.onLine;
  hayServidor = navigator.onLine;

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
    hayServidor = true; estado.enLinea = true; pintarConexion();
    if(estado.perfil) empujar($("#r-guardado"));
  });
  addEventListener("offline", () => {
    hayServidor = false; estado.enLinea = false; pintarConexion();
  });

  // El evento "online" miente cuando el wifi está pero no pasa tráfico.
  // Reintentar cada medio minuto cubre esa señal de taller que va y viene:
  // se vuelve a dar por buena la conexión y que el intento diga la verdad.
  setInterval(() => {
    if(estado.perfil && estado.porSubir){ hayServidor = true; empujar(); }
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

async function cargarPerfil(id, reintento = 0){
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

async function usarPerfil(p){
  estado.perfil = p;
  estado.vista = "panel";
  await cargarLista();
}

/* ================= acceso ================= */
function vistaAcceso(){
  return `
  <div class="acceso">
    <div>
      <h1>Bitácora de Diagnóstico</h1>
      <p class="sub">${esc(NOMBRE_TALLER)}. Entra con tu usuario para ver y continuar tus diagnósticos.</p>
    </div>
    <div class="conmuta" role="group" aria-label="Entrar o crear cuenta">
      <button type="button" id="m-entrar" aria-pressed="true">Entrar</button>
      <button type="button" id="m-crear" aria-pressed="false">Crear cuenta</button>
    </div>
    <div id="aviso" hidden></div>
    <form id="f-acceso" class="campos" autocomplete="on">
      <label class="f">Usuario
        <input id="a-usuario" name="username" autocapitalize="none" autocorrect="off"
               spellcheck="false" required placeholder="lrivera">
        <span class="pista">Solo minúsculas, números, punto o guion.</span>
      </label>
      <label class="f">Contraseña
        <input id="a-clave" name="password" type="password" required minlength="6"
               autocomplete="current-password" placeholder="Mínimo 6 caracteres">
      </label>
      <div id="extra" hidden class="campos">
        <label class="f">Código de clase
          <input id="a-codigo" inputmode="numeric" autocorrect="off" spellcheck="false"
                 placeholder="Te lo da el instructor">
          <span class="pista">Lo escribes tú. Solo hace falta al crear la cuenta, no para entrar.</span>
        </label>
        <label class="f">Nombre completo
          <input id="a-nombre" autocomplete="name" placeholder="Luis Rivera"></label>
        <label class="f">Grupo o sección
          <input id="a-grupo" placeholder="Tec. de Sistemas 4-B"></label>
        <label class="f">Escuela
          <input id="a-escuela" placeholder="Nombre del plantel"></label>
      </div>
      <button type="submit" class="btn" id="a-enviar">Entrar</button>
    </form>
  </div>`;
}

function montarAcceso(){
  // El QR abre directo en "Crear cuenta", pero nunca trae el código: el
  // estudiante lo teclea a mano, dictado o proyectado por el instructor.
  const desdeQR = new URLSearchParams(location.search).has("nuevo");
  let modo = desdeQR ? "crear" : "entrar";
  const set = m => {
    modo = m;
    $("#m-entrar").setAttribute("aria-pressed", m === "entrar");
    $("#m-crear").setAttribute("aria-pressed", m === "crear");
    $("#extra").hidden = m !== "crear";
    // El navegador no puede enfocar un campo escondido, así que la obligación
    // se pone y se quita con el modo, no en el HTML.
    $("#a-codigo").required = m === "crear";
    $("#a-enviar").textContent = m === "crear" ? "Crear mi cuenta" : "Entrar";
    $("#a-clave").setAttribute("autocomplete", m === "crear" ? "new-password" : "current-password");
    aviso("");
  };
  $("#m-entrar").onclick = () => set("entrar");
  $("#m-crear").onclick  = () => set("crear");
  if(desdeQR){
    set("crear");
    aviso("Llena tus datos y escribe el código de clase para crear tu cuenta.", "exito");
  }

  $("#f-acceso").onsubmit = async ev => {
    ev.preventDefault();
    aviso("");
    const btn = $("#a-enviar");
    btn.disabled = true;
    const usuario = $("#a-usuario").value.trim().toLowerCase();
    const clave   = $("#a-clave").value;
    const correo  = `${usuario}@${DOMINIO_LOGIN}`;

    if(!/^[a-z0-9._-]{3,32}$/.test(usuario)){
      aviso("El usuario debe tener entre 3 y 32 caracteres: minúsculas, números, punto, guion o guion bajo.");
      btn.disabled = false; return;
    }
    try{
      if(modo === "crear"){
        // La cuenta la crea una Edge Function con la API de administración:
        // así queda confirmada de una y no se envía ningún correo. auth.signUp
        // intentaría escribirle a un dominio que no existe y chocaría con el
        // límite de correos del plan gratuito.
        const { error } = await conCorte(sb.functions.invoke("registro", {
          body: {
            usuario, password: clave,
            codigo:  $("#a-codigo").value.trim(),
            nombre:  $("#a-nombre").value.trim(),
            grupo:   $("#a-grupo").value.trim(),
            escuela: $("#a-escuela").value.trim()
          }
        }));
        if(error){
          let msg = "No se pudo crear la cuenta. Revisa el internet y vuelve a intentar.";
          try { msg = (await error.context.json()).error || msg; } catch(_){}
          aviso(msg); btn.disabled = false; return;
        }
        // cuenta creada: entrar de una vez
        const { data, error: eEntrar } = await conCorte(
          sb.auth.signInWithPassword({ email: correo, password: clave }));
        if(eEntrar) throw eEntrar;
        await cargarPerfil(data.session.user.id);
      } else {
        const { data, error } = await conCorte(
          sb.auth.signInWithPassword({ email: correo, password: clave }));
        if(error) throw error;
        await cargarPerfil(data.session.user.id);
      }
      pintar();
    } catch(err){
      aviso(explicar(err));
      btn.disabled = false;
    }
  };
}

/* ================= panel ================= */
// La lista sale siempre del equipo del estudiante. Si hay señal, primero se
// baja lo de Supabase y se copia aquí; así la próxima vez sin internet la
// bitácora sigue estando completa.
async function cargarLista(){
  if(conectado()){
    const { data, error } = await conCorte(sb
      .from("diagnosticos")
      .select("id, orden, fecha, creado_en, estado, veredicto, conteo, sistema, hallazgos, equipos(serial, marca, modelo)")
      .order("fecha", { ascending:false })
      .order("creado_en", { ascending:false })
      .limit(200));
    if(error){ if(esDeRed(error)) hayServidor = false; else aviso(explicar(error)); }
    else await local.espejarLista(data || []);
  }
  estado.lista = await local.listaLocal();
  estado.porSubir = await local.porSubir();
  estado.enLinea = conectado();
}

function vistaPanel(){
  const p = estado.perfil;
  const filas = estado.lista.map(d => {
    const eq = d.equipos;
    const equipo = eq ? `${val(eq.marca,"")} ${val(eq.modelo,"")}`.trim() || eq.serial : "Equipo sin identificar";
    const c = d.conteo || {};
    return `
    <button class="tarjeta" data-abrir="${d.id}" data-v="${esc(d.veredicto)}">
      <span class="orden">${esc(val(d.orden,"—"))}</span>
      <span class="tit">${esc(equipo)}
        <small>${esc(fechaLarga(d.fecha))}${eq ? " · " + esc(eq.serial) : ""}</small>
      </span>
      <span class="pill${d.estado === "borrador" ? " borrador" : ""}" data-v="${esc(d.estado === "borrador" ? "" : d.veredicto)}">
        ${d.estado === "borrador" ? "Borrador" : esc(VEREDICTOS[d.veredicto] || "—")}
      </span>
      ${d.estado === "entregado" && loQueFalta(d).length
        ? '<span class="pill falta-pill" title="Entregada sin culminar">Falta</span>' : ""}
    </button>`;
  }).join("");

  return `
  <div class="pila">
    <div class="enc">
      <div>
        <h1>Mis diagnósticos</h1>
        <p>${estado.lista.length} ${estado.lista.length === 1 ? "hoja" : "hojas"} en la bitácora</p>
      </div>
      <div class="fila">
        ${p.rol === "instructor" ? '<button class="btn ghost" id="b-codigo">Código para entrar</button>' : ""}
        ${p.rol === "instructor" ? '<button class="btn ghost" id="b-instructor">Ver todo el grupo</button>' : ""}
        <button class="btn" id="b-nuevo">Nuevo diagnóstico</button>
      </div>
    </div>
    <div id="aviso" hidden></div>
    ${estado.lista.length
      ? `<div class="tarjetas">${filas}</div>`
      : `<div class="vacio">
           <p>Todavía no has registrado ningún diagnóstico.</p>
           <button class="btn" id="b-nuevo-2">Empezar el primero</button>
         </div>`}
  </div>`;
}

function montarPanel(){
  // La hoja nace en el equipo del estudiante, con su id ya puesto. Así se
  // puede empezar un diagnóstico en un taller sin señal y subirlo después:
  // el id no lo tiene que inventar Supabase.
  const nuevo = async () => {
    const d = {
      id: local.nuevoId(),
      autor_id: estado.perfil.id,
      equipo_id: null,
      fecha: hoy(),
      orden: "DX-" + hoy().replace(/-/g,"").slice(2) + "-" + String(estado.lista.length + 1).padStart(2,"0"),
      usuario_equipo: "", sistema: "", estado: "borrador", veredicto: "", conteo: {},
      acciones: "", hallazgos: "", proximo_paso: "",
      creado_en: new Date().toISOString(), entregado_en: null
    };
    await local.guardarDiag(d);
    estado.diag = d; estado.equipo = null; estado.puntos = {};
    estado.vista = "editor"; pintar();
    empujar();
  };
  $("#b-nuevo")?.addEventListener("click", nuevo);
  $("#b-nuevo-2")?.addEventListener("click", nuevo);
  $("#b-codigo")?.addEventListener("click", async () => {
    estado.vista = "codigo"; pintar();
    await cargarCodigoClase();
    if(estado.codigoClase){ estado.vista = "codigo"; pintar(); }
  });
  $("#b-instructor")?.addEventListener("click", async () => {
    estado.pestana = "hoy";
    if(!estado.taller) estado.taller = { fecha: hoy(), grupo: "", estudiantes: [], hojas: [] };
    estado.vista = "instructor"; pintar(); await cargarTaller();
  });
  app.querySelectorAll("[data-abrir]").forEach(b =>
    b.addEventListener("click", () => abrir(b.dataset.abrir)));
}

/* ================= mirar la hoja de otro (instructor) ================= */
// RLS deja al instructor EDITAR las hojas de sus estudiantes, no solo leerlas.
// Por eso esto no pasa por abrir(): un borrador ajeno abierto en el editor
// tiene autoguardado, y un toque para mirar le pisaría el trabajo a alguien
// que lo está escribiendo. Se abre siempre el reporte, de solo lectura.
//
// Tampoco toca el almacén local: lo de aquí es "mi trabajo", y guardar hojas
// ajenas las metería en "Mis diagnósticos" del instructor y las dejaría en el
// equipo del taller después de cerrar sesión.
async function abrirAjena(id){
  if(!conectado()){ aviso("Leer la hoja de un estudiante necesita conexión."); return; }
  const [{ data: d, error: e1 }, { data: pts, error: e2 }] = await Promise.all([
    conCorte(sb.from("diagnosticos").select("*, equipos(*), perfiles(usuario, nombre, grupo, escuela)")
      .eq("id", id).single()),
    conCorte(sb.from("puntos").select("clave, estado, nota").eq("diagnostico_id", id))
  ]);
  if(e1 || e2 || !d){
    if(esDeRed(e1 || e2)) hayServidor = false;
    aviso(explicar(e1 || e2 || new Error("No se encontró la hoja."))); return;
  }
  estado.diag = d;
  estado.equipo = d.equipos || null;
  estado.autor = d.perfiles || null;
  estado.ajena = true;
  estado.puntos = {};
  (pts || []).forEach(x => { estado.puntos[x.clave] = { estado: x.estado || "", nota: x.nota || "" }; });
  estado.vista = "reporte";
  pintar();
}

/* ================= editor ================= */
async function abrir(id){
  // Si hay señal se refresca desde Supabase, salvo que la copia de aquí
  // tenga cambios sin subir: en ese caso la buena es la de este equipo.
  if(conectado()){
    const [{ data: d, error: e1 }, { data: pts, error: e2 }] = await Promise.all([
      conCorte(sb.from("diagnosticos").select("*, equipos(*)").eq("id", id).single()),
      conCorte(sb.from("puntos").select("clave, grupo, titulo, estado, nota").eq("diagnostico_id", id))
    ]);
    if(d && !e1 && !e2) await local.espejarDiag(d, pts || [], d.equipos);
    else if(e1 || e2){ if(esDeRed(e1 || e2)) hayServidor = false; else aviso(explicar(e1 || e2)); }
  }

  const d = await local.leerDiag(id);
  if(!d){ aviso("Esa hoja no está guardada en este equipo y no hay conexión para bajarla."); return; }
  estado.diag = d;
  estado.autor = estado.perfil; estado.ajena = false;
  // El equipo sale del almacén de equipos, no del objeto anidado en la hoja:
  // ese solo lleva serial, marca y modelo, que es lo que enseña el panel. Si
  // se tomara de ahí, reabrir una hoja guardada sin señal vaciaría el tipo, el
  // inventario y la ubicación en pantalla, y el próximo guardado los borraría.
  const serial = d._serial || d.equipos?.serial;
  estado.equipo = (serial ? await local.leerEquipo(serial) : null) || d.equipos || null;
  estado.puntos = await local.leerPuntos(id);
  estado.vista = d.estado === "entregado" ? "reporte" : "editor";
  pintar();
}

function vistaEditor(){
  const d = estado.diag, eq = estado.equipo || {};
  const grupos = GRUPOS.map((g, gi) => {
    const items = PUNTOS.filter(p => p.gi === gi).map(p => {
      const cur = estado.puntos[p.clave] || {};
      const segs = ESTADOS.map(s => `
        <input type="radio" name="${p.clave}" id="${p.clave}-${s.v}" value="${s.v}"
               data-punto="${p.clave}" ${cur.estado === s.v ? "checked" : ""}>
        <label for="${p.clave}-${s.v}">${s.corto}</label>`).join("");
      return `
      <div class="punto">
        <div>
          <div class="punto-t">${esc(p.titulo)}</div>
          <div class="punto-h">${esc(p.ayuda)}</div>
        </div>
        <div class="seg" role="group" aria-label="Estado de: ${esc(p.titulo)}">${segs}</div>
        <input class="nota" data-nota="${p.clave}" value="${esc(cur.nota || "")}"
               placeholder="Nota u observación (opcional)">
      </div>`;
    }).join("");
    return `<section class="grupo"><h2><i>${g.n}</i>${esc(g.t)}</h2>${items}</section>`;
  }).join("");

  return `
  <div class="pila">
    <div class="enc">
      <div>
        <h1>Hoja de cotejo</h1>
        <p>${esc(val(d.orden,"Sin número de orden"))} · ${esc(fechaLarga(d.fecha))}</p>
      </div>
      <div class="fila">
        <button class="btn ghost chico" id="b-volver">Volver</button>
        <button class="btn ghost chico peligro" id="b-borrar">Borrar</button>
      </div>
    </div>
    <div id="aviso" hidden></div>

    <div class="ficha">
      <h2>Orden</h2>
      <label class="f">Orden núm.<input id="d-orden" value="${esc(d.orden)}" placeholder="DX-001"></label>
      <label class="f">Fecha<input id="d-fecha" type="date" value="${esc(d.fecha)}"></label>
      <label class="f">Usuario del equipo<input id="d-usuario_equipo" value="${esc(d.usuario_equipo)}" placeholder="Salón 204"></label>
      <label class="f">Sistema operativo<input id="d-sistema" value="${esc(d.sistema)}" placeholder="Windows 11 Pro"></label>

      <h2>Equipo</h2>
      <label class="f">Serial / service tag<input id="e-serial" value="${esc(eq.serial || "")}" placeholder="ABC1234">
        <span class="pista">El serial enlaza esta hoja con el historial del equipo.</span></label>
      <label class="f">Marca<input id="e-marca" value="${esc(eq.marca || "")}" placeholder="Dell"></label>
      <label class="f">Modelo<input id="e-modelo" value="${esc(eq.modelo || "")}" placeholder="OptiPlex 3080"></label>
      <label class="f">Tipo<input id="e-tipo" value="${esc(eq.tipo || "")}" placeholder="Torre de escritorio"></label>
      <label class="f">Núm. de inventario<input id="e-inventario" value="${esc(eq.inventario || "")}" placeholder="INV-00842"></label>
      <label class="f">Ubicación<input id="e-ubicacion" value="${esc(eq.ubicacion || "")}" placeholder="Salón 204"></label>
    </div>

    ${grupos}

    <section class="grupo">
      <h2><i>—</i>Cierre</h2>
      <div class="pila" style="padding-top:.5rem">
        <label class="f">Acciones realizadas
          <textarea id="d-acciones" placeholder="Limpieza de disipador. DISM y sfc /scannow sin errores.">${esc(d.acciones)}</textarea></label>
        <label class="f">Hallazgos y recomendaciones
          <textarea id="d-hallazgos" placeholder="Arranque de 3 min 40 s. Disco Healthy con 4% libre en C:. Se recomienda evaluar migración a SSD.">${esc(d.hallazgos)}</textarea></label>
        <label class="f">Próximo paso
          <select id="d-proximo_paso">
            ${["Devolver a uso normal","Programar mantenimiento preventivo","Enviar a reparación",
               "Solicitar pieza de repuesto","Retirar de servicio / reemplazar","Escalar al instructor"]
              .map(o => `<option${d.proximo_paso === o ? " selected" : ""}>${esc(o)}</option>`).join("")}
          </select></label>
      </div>
    </section>

    <div class="resumen no-print">
      <div class="resumen-in">
        <div class="vered" id="r-vered" data-v="">Sin evaluar</div>
        <div class="progreso" id="r-prog">0/${PUNTOS.length}</div>
        <div class="guardado" id="r-guardado"></div>
        <button class="btn" id="b-entregar">Entregar</button>
      </div>
    </div>
  </div>`;
}

const CAMPOS_DIAG = ["orden","fecha","usuario_equipo","sistema","acciones","hallazgos","proximo_paso"];
const CAMPOS_EQ   = ["serial","marca","modelo","tipo","inventario","ubicacion"];

function montarEditor(){
  $("#b-volver").onclick = async () => {
    clearTimeout(estado.pendiente);
    await guardar();                    // no perder los últimos tecleos
    await cargarLista();
    estado.vista = "panel"; pintar();
  };
  $("#b-borrar").onclick = async () => {
    if(!confirm("Se borra esta hoja y todo lo anotado. ¿Seguro?")) return;
    clearTimeout(estado.pendiente);
    // Sin señal el borrado queda anotado y se le avisa a Supabase después.
    await local.marcarBorrado(estado.diag.id);
    await empujar();
    await cargarLista(); estado.vista = "panel"; pintar();
  };

  CAMPOS_DIAG.forEach(c => $("#d-" + c)?.addEventListener("input", () => programarGuardado()));
  CAMPOS_EQ.forEach(c => $("#e-" + c)?.addEventListener("input", () => programarGuardado()));

  app.querySelectorAll("[data-punto]").forEach(r => r.addEventListener("change", () => {
    const clave = r.dataset.punto;
    estado.puntos[clave] = { ...(estado.puntos[clave] || {}), estado: r.value };
    pintarResumen();
    programarGuardado();
  }));
  app.querySelectorAll("[data-nota]").forEach(i => i.addEventListener("input", () => {
    const clave = i.dataset.nota;
    estado.puntos[clave] = { ...(estado.puntos[clave] || {}), nota: i.value };
    programarGuardado();
  }));

  $("#b-entregar").onclick = entregar;
  pintarResumen();
}

function estadosPlanos(){
  const o = {};
  Object.keys(estado.puntos).forEach(k => { if(estado.puntos[k].estado) o[k] = estado.puntos[k].estado; });
  return o;
}

function pintarResumen(){
  const r = resumir(estadosPlanos());
  const v = $("#r-vered");
  if(!v) return;
  let txt = VEREDICTOS[r.veredicto];
  if(r.veredicto && !r.completo) txt += " · incompleto";
  v.textContent = txt;
  v.setAttribute("data-v", r.veredicto);
  $("#r-prog").textContent = `${r.evaluados}/${r.total}`;
}

function programarGuardado(){
  const marca = $("#r-guardado");
  if(marca) marca.textContent = "Guardando…";
  clearTimeout(estado.pendiente);
  estado.pendiente = setTimeout(guardar, 800);
}

// Guardar es escribir en el equipo del estudiante; subir es lo que viene
// después y puede esperar. Por eso ya no existe "Sin guardar": lo anotado
// no se pierde aunque el taller no tenga señal.
async function guardar(){
  const marca = $("#r-guardado");

  // 1) el equipo, si hay serial
  const serial = ($("#e-serial")?.value || "").trim();
  let equipo = null;
  if(serial){
    equipo = { ...(estado.equipo || {}), serial };
    CAMPOS_EQ.filter(c => c !== "serial").forEach(c => { equipo[c] = $("#e-" + c).value.trim(); });
    if(!equipo.creado_por) equipo.creado_por = estado.perfil.id;
    estado.equipo = equipo;
  }

  // 2) el encabezado del diagnóstico. _serial queda anotado para poder
  //    enlazar el equipo al subir, cuando Supabase diga cuál es su id.
  const r = resumir(estadosPlanos());
  const d = { ...estado.diag, veredicto: r.veredicto, conteo: r.conteo, _serial: serial };
  CAMPOS_DIAG.forEach(c => { d[c] = $("#d-" + c).value; });
  if(equipo) d.equipos = { serial: equipo.serial, marca: equipo.marca, modelo: equipo.modelo };
  estado.diag = d;

  // 3) al disco de este equipo, con los puntos. Esto no depende de la red.
  await local.guardarTrabajo(d, estado.puntos, equipo, META_PUNTOS);
  if(marca) marca.textContent = "Guardado en este equipo";
  aviso("");

  // 4) y de aquí a Supabase, si se puede
  await empujar(marca);
}

async function entregar(){
  clearTimeout(estado.pendiente);
  await guardar();
  const r = resumir(estadosPlanos());
  if(!r.completo && !confirm(`Quedan ${r.conteo.sin} puntos sin evaluar. ¿Entregar así?`)) return;
  estado.diag = { ...estado.diag, estado: "entregado",
                  entregado_en: new Date().toISOString(),
                  veredicto: r.veredicto, conteo: r.conteo };
  await local.guardarDiag(estado.diag);
  await empujar();
  estado.vista = "reporte";
  pintar();
}

/* ================= reporte ================= */
function vistaReporte(){
  // El técnico de la hoja es su autor, no quien la está mirando: si el
  // instructor abre la hoja de un estudiante, la firma sigue siendo del
  // estudiante.
  const d = estado.diag, eq = estado.equipo || {}, p = estado.autor || estado.perfil;
  const r = resumir(estadosPlanos());
  const c = d.conteo || r.conteo;

  const cuerpo = GRUPOS.map((g, gi) => {
    const filas = PUNTOS.filter(x => x.gi === gi).map(x => {
      const cur = estado.puntos[x.clave] || {};
      const s = cur.estado || "";
      return `<div class="rrow"><em class="${s || "sin"}">${ETQ[s]}</em><span>${esc(x.titulo)}${
        cur.nota ? `<small>${esc(cur.nota)}</small>` : ""}</span></div>`;
    }).join("");
    return `<div class="rgrupo"><h3>${g.n} · ${esc(g.t)}</h3>${filas}</div>`;
  }).join("");

  return `
  <div class="pila">
    <div class="fila no-print">
      <button class="btn ghost chico" id="b-volver">${
        estado.ajena ? "Volver al taller" : "Volver a mis diagnósticos"}</button>
      <button class="btn chico" id="b-imprimir">Imprimir o guardar PDF</button>
      ${!estado.ajena && d.estado === "entregado"
        ? '<button class="btn ghost chico" id="b-reabrir">Reabrir como borrador</button>' : ""}
    </div>
    ${estado.ajena ? `<p class="ajena no-print">Hoja de ${esc(val(p.nombre, p.usuario))}. Solo lectura.</p>` : ""}
    <div id="aviso" hidden></div>
    ${(() => {
      const falta = inf.faltantes(d, eq, PUNTOS.length);
      return falta.length ? `<div class="falta">
        <b>Falta culminar esta hoja.</b>
        <span>Queda por poner: ${esc(falta.join(", "))}.</span></div>` : "";
    })()}
    <div class="hoja">
      <div class="hoja-h">
        <div><h1>Diagnóstico diario de equipo</h1>
          <p>Hoja de cotejo de hardware y software</p></div>
        <div class="orden">Orden ${esc(val(d.orden))}<br>${esc(fechaLarga(d.fecha))}</div>
      </div>
      <dl class="meta">
        <div><dt>Técnico</dt><dd>${esc(val(p.nombre, p.usuario))}</dd></div>
        <div><dt>Usuario</dt><dd>${esc(p.usuario)}</dd></div>
        <div><dt>Grupo</dt><dd>${esc(val(p.grupo))}</dd></div>
        <div><dt>Escuela</dt><dd>${esc(val(p.escuela))}</dd></div>
        <div><dt>Usuario del equipo</dt><dd>${esc(val(d.usuario_equipo))}</dd></div>
        <div><dt>Marca y modelo</dt><dd>${esc(val((eq.marca || "") + " " + (eq.modelo || "")))}</dd></div>
        <div><dt>Serial</dt><dd>${esc(val(eq.serial))}</dd></div>
        <div><dt>Inventario</dt><dd>${esc(val(eq.inventario))}</dd></div>
        <div><dt>Tipo</dt><dd>${esc(val(eq.tipo))}</dd></div>
        <div><dt>Sistema operativo</dt><dd>${esc(val(d.sistema))}</dd></div>
      </dl>
      <div class="rveredicto">
        <b>${esc(VEREDICTOS[d.veredicto] || "Sin evaluar")}</b>
        <span>${c.ok || 0} bien · ${c.obs || 0} observación · ${c.falla || 0} falla · ${c.na || 0} N/A · ${c.sin || 0} sin evaluar</span>
      </div>
      ${cuerpo}
      <div class="rgrupo"><h3>Acciones realizadas</h3>
        ${d.acciones ? `<p class="prosa">${esc(d.acciones)}</p>` : '<p class="sinval">No se registraron acciones.</p>'}</div>
      <div class="rgrupo"><h3>Hallazgos y recomendaciones</h3>
        ${d.hallazgos ? `<p class="prosa">${esc(d.hallazgos)}</p>` : '<p class="sinval">No se registraron hallazgos.</p>'}</div>
      <div class="rgrupo"><h3>Próximo paso</h3><p class="prosa">${esc(val(d.proximo_paso))}</p></div>
      <div class="firmas"><div>Firma del técnico</div><div>Firma del instructor</div></div>
    </div>
  </div>`;
}

function montarReporte(){
  $("#b-volver").onclick = async () => {
    if(estado.ajena){
      estado.ajena = false; estado.autor = estado.perfil; estado.diag = null;
      estado.vista = "instructor"; pintar(); await cargarTaller();
      return;
    }
    await cargarLista(); estado.vista = "panel"; pintar();
  };
  $("#b-imprimir").onclick = () => window.print();
  $("#b-reabrir")?.addEventListener("click", async () => {
    estado.diag = { ...estado.diag, estado: "borrador", entregado_en: null };
    await local.guardarDiag(estado.diag);
    await empujar();
    estado.vista = "editor"; pintar();
  });
}

// Qué le falta a una hoja para estar culminada. No bloquea nada —eso se
// decidió así— pero se dice en los tres sitios donde alguien puede hacer algo
// al respecto: la hoja del estudiante, su panel y el tablero del docente.
const loQueFalta = h => inf.faltantes(h, h?.equipos, PUNTOS.length);

/* ================= informes, inventario y duplicados ================= */
// Una sola bajada para las tres pestañas: son las mismas tablas cruzadas de
// distintas maneras, y pedirlas por separado tres veces no ayuda a nadie.
async function cargarDatos(){
  if(!conectado()){
    aviso("Los informes necesitan conexión: el trabajo de los demás no se guarda en tu equipo.");
    return false;
  }
  const [{ data: gente, error: e1 }, { data: eqs, error: e2 }, { data: hojas, error: e3 }] =
    await Promise.all([
      conCorte(sb.from("perfiles").select("id, usuario, nombre, grupo, escuela, rol")),
      conCorte(sb.from("equipos").select("*")),
      conCorte(sb.from("diagnosticos")
        .select("id, autor_id, equipo_id, orden, fecha, estado, veredicto, conteo, sistema, hallazgos, actualizado_en")
        .order("fecha", { ascending:false }).limit(2000))
    ]);
  const err = e1 || e2 || e3;
  if(err){ if(esDeRed(err)) hayServidor = false; aviso(explicar(err)); return false; }

  const estudiantes = (gente || []).filter(p => p.rol === "estudiante");
  estado.datos = {
    estudiantes, equipos: eqs || [], diagnosticos: hojas || [],
    porId: Object.fromEntries((gente || []).map(p => [p.id, p])),
    eqPorId: Object.fromEntries((eqs || []).map(e => [e.id, e]))
  };
  aviso("");
  return true;
}

/* ---------- la gráfica de trabajo acumulado ---------- */
// Barras horizontales porque los nombres son largos, ordenadas de más a menos
// para que el que hay que buscar quede abajo del todo y salte a la vista.
//
// Dos series y no una: seis hojas todas sin entregar no es lo mismo que seis
// entregadas, y es justo la diferencia que decide si hay que sentarse a
// hablar con alguien. Los colores están validados para daltonismo y para los
// dos temas; el aqua no llega a 3:1 sobre el fondo claro, así que la cifra va
// escrita al final de cada barra y la tabla de abajo repite todos los valores.
function graficaTrabajo(filas){
  const conAlgo = filas.filter(f => f.hojas > 0);
  if(!conAlgo.length) return `<p class="vacio-chico">Todavía no hay trabajo que graficar.</p>`;
  const tope = Math.max(...filas.map(f => f.hojas));

  const barras = filas.map(f => {
    const pct = n => tope ? (n / tope) * 100 : 0;
    const t = `${f.nombre}: ${f.entregadas} entregada${f.entregadas === 1 ? "" : "s"}, ` +
              `${f.borradores} sin entregar`;
    return `
    <div class="g-fila"${f.hojas === 0 ? ' data-cero="1"' : ""}>
      <span class="g-nombre" title="${esc(f.nombre)}">${esc(f.nombre)}</span>
      <span class="g-barra">
        ${f.entregadas ? `<i class="s1" style="width:${pct(f.entregadas)}%" title="${esc(t)}"></i>` : ""}
        ${f.borradores ? `<i class="s2" style="width:${pct(f.borradores)}%" title="${esc(t)}"></i>` : ""}
      </span>
      <span class="g-valor">${f.hojas || "—"}</span>
    </div>`;
  }).join("");

  return `
  <figure class="grafica">
    <figcaption>
      <b>Trabajo acumulado por estudiante</b>
      <span>Hojas de diagnóstico. Ordenadas de más a menos.</span>
    </figcaption>
    <div class="leyenda">
      <span><i class="s1"></i>Entregadas</span>
      <span><i class="s2"></i>Sin entregar</span>
    </div>
    <div class="g-cuerpo">${barras}</div>
  </figure>`;
}

/* ---------- tablas de cada informe ---------- */
const tabla = (encabezados, filas) => `
  <div class="tabla-envoltura">
    <table class="datos">
      <thead><tr>${encabezados.map(h => `<th>${esc(h)}</th>`).join("")}</tr></thead>
      <tbody>${filas}</tbody>
    </table>
  </div>`;

function informePorEstudiante(){
  const d = estado.datos;
  const filas = inf.porEstudiante(d.estudiantes, d.diagnosticos, PUNTOS.length, d.eqPorId);
  const cuerpo = filas.map(f => `<tr>
    <td>${esc(f.nombre)}<small class="sub-td">${esc(f.usuario)}</small></td>
    <td>${esc(f.grupo || "—")}</td>
    <td class="num">${f.hojas}</td>
    <td class="num">${f.entregadas}</td>
    <td class="num">${f.borradores}</td>
    <td class="num">${f.puntos}</td>
    <td class="num">${f.fallas}</td>
    <td class="num">${f.incompletas ? `<span class="pill" data-v="obs">${f.incompletas}</span>` : "—"}</td>
    <td class="num">${esc(f.ultima || "—")}</td>
  </tr>`).join("");
  return graficaTrabajo(filas) +
    tabla(["Estudiante","Grupo","Hojas","Entregadas","Sin entregar","Puntos evaluados",
           "Fallas halladas","Sin culminar","Última"], cuerpo);
}

function informePorGrupo(){
  const d = estado.datos;
  const filas = inf.porGrupo(d.estudiantes, d.diagnosticos, PUNTOS.length);
  const cuerpo = filas.map(f => `<tr>
    <td>${esc(f.grupo)}</td>
    <td class="num">${f.activos} de ${f.estudiantes}</td>
    <td class="num">${f.hojas}</td>
    <td class="num">${f.entregadas}</td>
    <td class="num">${f.puntos}</td>
    <td class="num">${f.fallas}</td>
    <td class="num">${f.noAptos}</td>
    <td class="num">${esc(f.ultima || "—")}</td>
  </tr>`).join("");
  return tabla(["Grupo","Han trabajado","Hojas","Entregadas","Puntos evaluados",
                "Fallas","Equipos no aptos","Última"], cuerpo);
}

function informePorSalon(){
  const d = estado.datos;
  const filas = inf.porSalon(d.equipos, d.diagnosticos, PUNTOS.length);
  if(!filas.length) return `<p class="vacio-chico">Todavía no hay equipos registrados.</p>`;
  const cuerpo = filas.map(f => `<tr>
    <td>${esc(f.salon)}</td>
    <td class="num">${f.equipos}</td>
    <td class="num">${f.diagnosticados}</td>
    <td class="num">${f.equiposAptos ? `<span class="pill" data-v="apto">${f.equiposAptos}</span>` : "—"}</td>
    <td class="num">${f.equiposConObs ? `<span class="pill" data-v="obs">${f.equiposConObs}</span>` : "—"}</td>
    <td class="num">${f.equiposNoAptos ? `<span class="pill" data-v="no">${f.equiposNoAptos}</span>` : "—"}</td>
    <td class="num">${f.equiposSinVeredicto || "—"}</td>
    <td class="num">${esc(f.ultima || "—")}</td>
  </tr>`).join("");
  return `<p class="pista">El veredicto es el de la última revisión entregada de cada equipo.</p>` +
    tabla(["Salón","Equipos","Revisados","Aptos","Con obs.","No aptos","Sin veredicto","Última"], cuerpo);
}

/* ---------- inventario ---------- */
function vistaInventario(){
  const d = estado.datos;
  if(!d) return `<p class="vacio-chico">Cargando…</p>`;
  const filas = inf.inventario(d.equipos, d.diagnosticos, d.porId);
  if(!filas.length) return `<p class="vacio-chico">El inventario se llena solo: cada serial
    que un estudiante escribe en una hoja entra aquí. Todavía no hay ninguno.</p>`;
  const cuerpo = filas.map(f => `<tr>
    <td class="num">${esc(f.serial)}</td>
    <td>${esc(`${f.marca} ${f.modelo}`.trim() || "—")}<small class="sub-td">${esc(f.tipo)}</small></td>
    <td class="num">${esc(f.inventario || "—")}</td>
    <td>${esc(f.ubicacion)}</td>
    <td class="num">${f.revisiones}</td>
    <td><span class="pill" data-v="${esc(f.ultimoVeredicto)}">${
      esc(VEREDICTOS[f.ultimoVeredicto] || "Sin entregar")}</span></td>
    <td class="num">${esc(f.ultimaFecha || "—")}</td>
    <td>${esc(f.ultimoTecnico || "—")}</td>
  </tr>`).join("");
  return `
    <div class="filtros no-print">
      <p class="pista">${filas.length} equipos, acumulados de lo que los estudiantes han escrito.</p>
      <button class="btn ghost chico" id="b-csv">Descargar CSV</button>
    </div>` +
    tabla(["Serial","Equipo","Inventario","Salón","Revisiones","Último veredicto","Fecha","Técnico"], cuerpo);
}

function csvInventario(){
  const d = estado.datos;
  const filas = inf.inventario(d.equipos, d.diagnosticos, d.porId);
  const cab = ["serial","marca","modelo","tipo","inventario","ubicacion",
               "revisiones","ultimo_veredicto","ultima_fecha","ultimo_tecnico"];
  // comillas dobles escapadas: un modelo con coma no puede partir la columna
  const cel = v => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const cuerpo = filas.map(f => [f.serial, f.marca, f.modelo, f.tipo, f.inventario, f.ubicacion,
    f.revisiones, VEREDICTOS[f.ultimoVeredicto] || "", f.ultimaFecha || "", f.ultimoTecnico]
    .map(cel).join(",")).join("\n");
  // BOM para que Excel abra los acentos bien
  return "\uFEFF" + cab.join(",") + "\n" + cuerpo;
}

// Cada pestaña se pinta sola dentro de su caja, sin repintar la vista entera:
// así no se pierde el sitio ni se cierra el teclado del filtro.
function pintarPestana(p){
  const caja = $(p === "informes" ? "#cuerpo-informe" : "#cuerpo-" + p);
  if(!caja || !estado.datos) return;
  if(p === "informes"){
    caja.innerHTML =
      estado.informe === "estudiante" ? informePorEstudiante() :
      estado.informe === "grupo"      ? informePorGrupo() :
      estado.informe === "salon"      ? informePorSalon() : vistaTablaTaller();
    if(estado.informe === "todo") montarTablaTaller();
  } else if(p === "inventario"){
    caja.innerHTML = vistaInventario();
    const b = $("#b-csv");
    if(b) b.onclick = () => descargar("inventario-taller.csv", csvInventario(), "text/csv");
  } else if(p === "revisar"){
    caja.innerHTML = vistaRevisar();
    enlazarAjenas(caja);
    caja.querySelectorAll("[data-unir-eq]").forEach(b =>
      b.onclick = () => unirEquipos(b.dataset.unirEq));
    caja.querySelectorAll("[data-unir-gente]").forEach(b =>
      b.onclick = () => unirEstudiantes(b.dataset.unirGente));
  }
}

function descargar(nombre, texto, tipo){
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([texto], { type: tipo + ";charset=utf-8" }));
  a.download = nombre;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

/* ---------- revisar: duplicados y hojas sin culminar ---------- */
function vistaRevisar(){
  const d = estado.datos;
  if(!d) return `<p class="vacio-chico">Cargando…</p>`;
  const dup = inf.duplicados(d.equipos, d.diagnosticos, d.estudiantes, d.porId);
  const incompletas = d.diagnosticos
    .filter(x => x.estado === "entregado")
    .map(x => ({ hoja: x, falta: inf.faltantes(x, d.eqPorId[x.equipo_id], PUNTOS.length) }))
    .filter(x => x.falta.length);

  const nada = `<p class="vacio-chico">Nada que revisar por aquí.</p>`;

  const secSerial = dup.serial.length ? dup.serial.map(g => {
    const gana = inf.elegirSuperviviente(g.equipos, g.revisiones);
    return `
    <div class="dup">
      <div class="dup-cab">
        <b>Una misma máquina, ${g.equipos.length} veces</b>
        <span class="pista">Los seriales solo se diferencian en mayúsculas, guiones o espacios.</span>
      </div>
      <ul class="dup-lista">${g.equipos.map((eq, i) => `
        <li${i === gana ? ' class="gana"' : ""}>
          <code>${esc(eq.serial)}</code>
          <span>${esc(`${eq.marca || ""} ${eq.modelo || ""}`.trim() || "sin marca")} ·
            ${esc(eq.ubicacion || "sin salón")}</span>
          <span class="num">${g.revisiones[i]} ${g.revisiones[i] === 1 ? "revisión" : "revisiones"}</span>
          ${i === gana ? '<span class="pill" data-v="apto">se queda</span>' : ""}
        </li>`).join("")}</ul>
      <button class="btn ghost chico" data-unir-eq="${esc(g.clave)}">
        Unificar en <code>${esc(g.equipos[gana].serial)}</code></button>
    </div>`;
  }).join("") : nada;

  const secInv = dup.inventario.length ? dup.inventario.map(g => `
    <div class="dup">
      <div class="dup-cab">
        <b>Número de inventario repetido: <code>${esc(g.equipos[0].inventario)}</code></b>
        <span class="pista">Son máquinas distintas con el mismo número. Suele ser un error
          de tecleo: corrígelo en la hoja del equipo que esté mal.</span>
      </div>
      <ul class="dup-lista">${g.equipos.map(eq => `
        <li><code>${esc(eq.serial)}</code>
          <span>${esc(`${eq.marca || ""} ${eq.modelo || ""}`.trim() || "sin marca")} ·
            ${esc(eq.ubicacion || "sin salón")}</span></li>`).join("")}</ul>
    </div>`).join("") : nada;

  const secHojas = dup.hojas.length ? dup.hojas.map(g => {
    const eq = estado.datos.eqPorId[g.equipo_id];
    return `
    <div class="dup">
      <div class="dup-cab">
        <b>${esc(eq?.serial || "Un equipo")} revisado ${g.hojas.length} veces el ${esc(g.fecha)}</b>
        <span class="pista">${g.autores.length > 1
          ? "Lo trabajaron " + esc(g.autores.join(" y ")) + " sin saber el uno del otro."
          : "La misma persona abrió dos hojas del mismo equipo."}</span>
      </div>
      <ul class="dup-lista">${g.hojas.map(h => `
        <li><code>${esc(val(h.orden, "sin orden"))}</code>
          <span>${esc(estado.datos.porId[h.autor_id]?.nombre || "?")}</span>
          <span class="pill" data-v="${esc(h.estado === "borrador" ? "" : h.veredicto)}">${
            h.estado === "borrador" ? "Borrador" : esc(VEREDICTOS[h.veredicto] || "—")}</span>
          <button class="btn ghost chico" data-ajena="${esc(h.id)}">Ver</button></li>`).join("")}</ul>
    </div>`;
  }).join("") : nada;

  const secGente = dup.estudiantes.length ? dup.estudiantes.map(g => {
    const gana = g.hojas.indexOf(Math.max(...g.hojas));
    return `
    <div class="dup">
      <div class="dup-cab">
        <b>${esc(g.estudiantes[0].nombre)} tiene ${g.estudiantes.length} cuentas</b>
        <span class="pista">Al unificar, el trabajo pasa todo a la cuenta que se queda.
          La otra queda vacía y la borras desde el panel de Supabase.</span>
      </div>
      <ul class="dup-lista">${g.estudiantes.map((e, i) => `
        <li${i === gana ? ' class="gana"' : ""}>
          <code>${esc(e.usuario)}</code>
          <span>${esc(e.grupo || "sin grupo")}</span>
          <span class="num">${g.hojas[i]} ${g.hojas[i] === 1 ? "hoja" : "hojas"}</span>
          ${i === gana ? '<span class="pill" data-v="apto">se queda</span>' : ""}</li>`).join("")}</ul>
      ${g.hojas.filter((_, i) => i !== gana).some(n => n > 0)
        ? `<button class="btn ghost chico" data-unir-gente="${esc(g.clave)}">
            Pasar todo a <code>${esc(g.estudiantes[gana].usuario)}</code></button>`
        : `<p class="pista">El trabajo ya está todo en una cuenta. Las demás siguen
            existiendo vacías: bórralas en Authentication → Users del panel de Supabase.</p>`}
    </div>`;
  }).join("") : nada;

  const secFalta = incompletas.length ? `
    <p class="pista">Entregadas pero sin culminar. No se bloquea nada: es para que decidas.</p>` +
    tabla(["Hoja","Estudiante","Fecha","Qué le falta",""], incompletas.map(x => `<tr>
      <td class="num">${esc(val(x.hoja.orden, "—"))}</td>
      <td>${esc(estado.datos.porId[x.hoja.autor_id]?.nombre || "?")}</td>
      <td class="num">${esc(x.hoja.fecha)}</td>
      <td>${esc(x.falta.join(", "))}</td>
      <td><button class="btn ghost chico" data-ajena="${esc(x.hoja.id)}">Ver</button></td>
    </tr>`).join("")) : nada;

  const n = inf.hayDuplicados(dup) + incompletas.length;
  return `
    <p class="pista no-print">${n
      ? `${n} ${n === 1 ? "cosa" : "cosas"} por revisar.`
      : "Nada pendiente: sin duplicados y sin hojas a medias."}</p>
    <h2 class="rev-t">Hojas entregadas sin culminar</h2>${secFalta}
    <h2 class="rev-t">La misma máquina con el serial escrito distinto</h2>${secSerial}
    <h2 class="rev-t">El mismo equipo revisado dos veces el mismo día</h2>${secHojas}
    <h2 class="rev-t">Números de inventario repetidos</h2>${secInv}
    <h2 class="rev-t">Estudiantes con más de una cuenta</h2>${secGente}`;
}

/* ---------- unificar ---------- */
// Unificar borra filas, así que nunca pasa sola: se pregunta, se hace y se
// vuelve a bajar todo para que lo que se enseñe sea lo que hay de verdad.
async function unirEquipos(clave){
  const d = estado.datos;
  const grupo = inf.duplicados(d.equipos, d.diagnosticos, d.estudiantes, d.porId)
    .serial.find(g => g.clave === clave);
  if(!grupo) return;
  const i = inf.elegirSuperviviente(grupo.equipos, grupo.revisiones);
  const gana = grupo.equipos[i];
  const pierden = grupo.equipos.filter((_, j) => j !== i);
  const total = grupo.revisiones.reduce((a, b) => a + b, 0) - grupo.revisiones[i];

  if(!confirm(`Se queda "${gana.serial}" y desaparecen ${pierden.map(e => `"${e.serial}"`).join(", ")}.\n` +
              `${total} ${total === 1 ? "hoja pasa" : "hojas pasan"} al equipo que se queda. ` +
              `Esto no se puede deshacer. ¿Seguir?`)) return;

  // primero se mueven las hojas y después se borran los equipos: al revés,
  // la clave foránea las dejaría sueltas sin equipo
  for(const eq of pierden){
    const { error } = await conCorte(
      sb.from("diagnosticos").update({ equipo_id: gana.id }).eq("equipo_id", eq.id));
    if(error){ aviso(explicar(error)); return; }
  }
  const { error } = await conCorte(
    sb.from("equipos").delete().in("id", pierden.map(e => e.id)));
  if(error){ aviso(explicar(error)); return; }
  await recargarInstructor(`Unificado en ${gana.serial}.`);
}

async function unirEstudiantes(clave){
  const d = estado.datos;
  const grupo = inf.duplicados(d.equipos, d.diagnosticos, d.estudiantes, d.porId)
    .estudiantes.find(g => g.clave === clave);
  if(!grupo) return;
  const i = grupo.hojas.indexOf(Math.max(...grupo.hojas));
  const gana = grupo.estudiantes[i];
  const pierden = grupo.estudiantes.filter((_, j) => j !== i);
  const total = grupo.hojas.reduce((a, b) => a + b, 0) - grupo.hojas[i];

  if(!confirm(`El trabajo de ${pierden.map(e => `"${e.usuario}"`).join(", ")} pasa a "${gana.usuario}".\n` +
              `Son ${total} ${total === 1 ? "hoja" : "hojas"}. La cuenta vacía hay que borrarla ` +
              `desde el panel de Supabase. ¿Seguir?`)) return;

  for(const e of pierden){
    const { error } = await conCorte(
      sb.from("diagnosticos").update({ autor_id: gana.id }).eq("autor_id", e.id));
    if(error){ aviso(explicar(error)); return; }
  }
  await recargarInstructor(
    `Trabajo pasado a ${gana.usuario}. Borra ${pierden.map(e => e.usuario).join(", ")} ` +
    `desde Authentication → Users en Supabase.`);
}

async function recargarInstructor(mensaje){
  await cargarDatos();
  pintar();
  if(mensaje) aviso(mensaje, "exito");
}

/* ================= código de entrada (instructor) ================= */
// El QR se dibuja en el navegador y no se guarda como imagen en el repo: así
// siempre lleva la dirección real desde donde se abrió la app. El código de
// clase NO viaja en el enlace; va impreso en el cartel para que el estudiante
// lo escriba. Un enlace que se cuele fuera del salón no abre cuentas solo.
//
// La librería se carga solo cuando hace falta: son 20 KB que un estudiante
// nunca necesita. El service worker la tiene guardada, así que entra al
// momento y también sin señal.
let qrCargado = null;
function cargarQR(){
  if(window.qrcode) return Promise.resolve(window.qrcode);
  if(qrCargado) return qrCargado;
  qrCargado = new Promise((ok, mal) => {
    const et = document.createElement("script");
    et.src = "./vendor/qr.js";
    et.onload = () => ok(window.qrcode);
    et.onerror = () => { qrCargado = null; mal(new Error("No se pudo cargar el generador de QR.")); };
    document.head.appendChild(et);
  });
  return qrCargado;
}

// La dirección de la app tal como el navegador la tiene abierta, sin el
// index.html ni parámetros: es la que hay que repartir.
function direccionApp(){
  const u = new URL(location.href);
  u.search = ""; u.hash = "";
  u.pathname = u.pathname.replace(/index\.html$/, "");
  return u.toString();
}

function enlaceEntrada(){
  return `${direccionApp()}?nuevo=1`;
}

async function cargarCodigoClase(){
  if(!conectado()) return;
  const { data, error } = await conCorte(
    sb.from("ajustes").select("valor").eq("clave", "codigo_registro").maybeSingle());
  if(!error && data) estado.codigoClase = data.valor;
}

function vistaCodigo(){
  return `
  <div class="pila">
    <div class="enc no-print">
      <div><h1>Código para entrar</h1>
        <p>Pégalo en la plataforma de los estudiantes o proyéctalo en clase.</p></div>
      <button class="btn ghost" id="b-volver">Volver</button>
    </div>
    <div id="aviso" hidden></div>

    <div class="cartel">
      <h2>Bitácora de Diagnóstico</h2>
      <p class="cartel-sub">${esc(NOMBRE_TALLER)}</p>
      <div class="qr" id="qr">Generando…</div>
      <p class="cartel-url" id="qr-url">${esc(enlaceEntrada())}</p>
      ${estado.codigoClase ? `<p class="cartel-cod">Código de clase: <b>${esc(estado.codigoClase)}</b></p>` : ""}
      <p class="cartel-pie">Escanea con la cámara del teléfono y escribe el código de arriba.
        Crea tu cuenta una sola vez; después entras con tu usuario y contraseña.</p>
    </div>

    <div class="filtros no-print">
      <button class="btn ghost chico" id="b-png">Descargar imagen</button>
      <button class="btn ghost chico" id="b-imprimir">Imprimir el cartel</button>
    </div>
    <p class="pista no-print">El QR abre la app en <i>Crear cuenta</i>, pero el código no
      viaja en el enlace: el estudiante lo escribe a mano. Proyéctalo o díctalo en clase.</p>
  </div>`;
}

async function pintarQR(){
  const caja = $("#qr");
  if(!caja) return;
  try{
    const qrcode = await cargarQR();
    // nivel M de corrección y tipo automático: aguanta que el cartel se
    // imprima regular o se escanee de una pantalla proyectada
    const q = qrcode(0, "M");
    q.addData(enlaceEntrada());
    q.make();
    caja.innerHTML = q.createSvgTag({ cellSize: 8, margin: 8, scalable: true });
    const url = $("#qr-url");
    if(url) url.textContent = enlaceEntrada();
  } catch(err){ caja.textContent = "No se pudo generar el QR."; aviso(explicar(err)); }
}

function montarCodigo(){
  $("#b-volver").onclick = () => { estado.vista = "panel"; pintar(); };
  $("#b-imprimir").onclick = () => window.print();
  // El SVG se pasa por un lienzo para bajarlo como PNG: es lo que aceptan
  // las plataformas escolares, que no siempre dejan subir SVG.
  $("#b-png").onclick = async () => {
    const svg = $("#qr svg");
    if(!svg){ aviso("Todavía no hay QR que descargar."); return; }
    const lado = 1024;
    const blob = new Blob([new XMLSerializer().serializeToString(svg)], { type:"image/svg+xml" });
    const src = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = c.height = lado;
      const g = c.getContext("2d");
      g.fillStyle = "#fff"; g.fillRect(0, 0, lado, lado);
      g.drawImage(img, 0, 0, lado, lado);
      URL.revokeObjectURL(src);
      const a = document.createElement("a");
      a.href = c.toDataURL("image/png");
      a.download = "bitacora-taller-qr.png";
      a.click();
    };
    img.onerror = () => { URL.revokeObjectURL(src); aviso("No se pudo convertir el QR a imagen."); };
    img.src = src;
  };
  pintarQR();
}

/* ================= tablero del día (instructor) ================= */
// La pregunta de la clase no es "qué se entregó" sino "quién no ha empezado",
// y esa no se puede contestar con la tabla de diagnósticos: el que no hizo
// nada no tiene fila. Por eso se pide la lista de estudiantes aparte y las
// hojas del día se cuelgan de ella. RLS deja al instructor leer los perfiles.
async function cargarTaller(){
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
    if(esDeRed(e1 || e2)) hayServidor = false;
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
function barraAvance(hechos, total){
  const pct = total ? Math.round((hechos / total) * 100) : 0;
  return `<span class="avance" aria-hidden="true"><i style="width:${pct}%"></i></span>`;
}

// Entregada: qué veredicto le salió. Sin entregar: cuándo la tocó por última
// vez, que es lo que dice si el estudiante sigue trabajando o se atascó.
function marcaHoja(h){
  if(h.estado !== "entregado")
    return `<span class="cuando">${esc(haceCuanto(h.actualizado_en))}</span>`;
  const falta = loQueFalta(h);
  const pill = `<span class="pill" data-v="${esc(h.veredicto)}">${
    esc(VEREDICTOS[h.veredicto] || "Entregado")}</span>`;
  return falta.length
    ? pill + `<span class="pill falta-pill" title="${esc("Falta: " + falta.join(", "))}">Falta</span>`
    : pill;
}

function lineaHoja(h, sangrada){
  const a = avance(h, PUNTOS.length);
  const eq = h.equipos;
  return `
  <button class="hoja-linea${sangrada ? " sangrada" : ""}" data-ajena="${h.id}">
    ${barraAvance(a.hechos, a.total)}
    <span class="quien-hoja">${sangrada ? esc(val(h.orden, "Otra hoja")) : ""}${
      eq ? `<small>${esc(eq.serial)}</small>` : ""}</span>
    <span class="cuenta">${a.hechos}/${a.total}</span>
    ${marcaHoja(h)}
  </button>`;
}

function filasTaller(){
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
      <button class="fila-t" data-ajena="${h.id}">
        ${barraAvance(a.hechos, a.total)}${nombre}
        <span class="cuenta">${a.hechos}/${a.total}</span>
        ${marcaHoja(h)}
      </button>`;
  }).join("");
}

function resumenTaller(){
  const t = estado.taller;
  const r = armarResumen(t.estudiantes, t.hojas, t.grupo);
  if(!r.total) return "";
  return `${r.empezaron} de ${r.total} empezaron · ${r.entregaron} ${
    r.entregaron === 1 ? "entregó" : "entregaron"}`;
}

// Enlaza solo dentro de su contenedor: el tablero y la tabla se repintan por
// separado, y enlazar sobre todo el documento duplicaría los manejadores.
function enlazarAjenas(raiz){
  raiz?.querySelectorAll("[data-ajena]").forEach(b => {
    b.addEventListener("click", () => abrirAjena(b.dataset.ajena));
    b.addEventListener("keydown", ev => {
      if(ev.key === "Enter" || ev.key === " "){ ev.preventDefault(); abrirAjena(b.dataset.ajena); }
    });
  });
}

function pintarTaller(){
  pintarGrupos();
  const cuerpo = $("#taller-cuerpo");
  if(cuerpo){ cuerpo.innerHTML = filasTaller(); enlazarAjenas(cuerpo); }
  const res = $("#taller-resumen");
  if(res) res.textContent = resumenTaller();
}

// La vista se dibuja antes de que lleguen los estudiantes, así que cuando se
// pintó el <select> todavía no se sabía qué grupos hay. Hay que rellenarlo al
// llegar los datos, conservando lo que el instructor tuviera escogido.
function pintarGrupos(){
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

/* ================= vista de instructor ================= */
// Lo único que no funciona sin señal: el trabajo de los demás nunca se
// guarda en el equipo del instructor, porque no es suyo.

// Las hojas con el nombre de su autor y su equipo ya pegados, que es como se
// leen en la tabla. Sale de estado.datos y no de una consulta aparte: son las
// mismas filas que ya usan los informes.
function hojasConTodo(){
  const d = estado.datos;
  if(!d) return [];
  return d.diagnosticos.map(h => {
    const a = d.porId[h.autor_id] || {}, e = d.eqPorId[h.equipo_id] || {};
    return { ...h, autor_nombre: a.nombre || "", autor_usuario: a.usuario || "",
             autor_grupo: a.grupo || "", equipo_serial: e.serial || "",
             equipo_marca: e.marca || "", equipo_modelo: e.modelo || "" };
  });
}

function filasInstructor(filas){
  return filas.map(f => {
    const c = f.conteo || {};
    return `<tr data-ajena="${esc(f.id)}" tabindex="0" role="button">
      <td class="num">${esc(f.fecha)}</td>
      <td>${esc(f.autor_nombre || f.autor_usuario)}</td>
      <td>${esc(f.autor_grupo || "—")}</td>
      <td class="num">${esc(f.equipo_serial || "—")}</td>
      <td>${esc(`${f.equipo_marca} ${f.equipo_modelo}`.trim() || "—")}</td>
      <td><span class="pill" data-v="${esc(f.estado === "borrador" ? "" : f.veredicto)}">${
        f.estado === "borrador" ? "Borrador" : esc(VEREDICTOS[f.veredicto] || "—")}</span></td>
      <td class="num">${c.ok || 0}/${c.obs || 0}/${c.falla || 0}</td>
    </tr>`;
  }).join("");
}

function vistaInstructor(){
  const t = estado.taller || { fecha: hoy(), grupo: "", estudiantes: [], hojas: [] };
  const esHoy = t.fecha === hoy();
  const grupos = [...new Set(t.estudiantes.map(e => e.grupo).filter(Boolean))].sort();

  return `
  <div class="pila">
    <div class="enc">
      <div><h1>El taller</h1>
        <p>${esc(val(estado.perfil?.escuela, NOMBRE_TALLER))}</p></div>
      <button class="btn ghost" id="b-volver">Mis diagnósticos</button>
    </div>
    <div class="conmuta pestanas no-print" role="group" aria-label="Qué mirar">
      <button type="button" id="p-hoy" aria-pressed="true">El día</button>
      <button type="button" id="p-informes" aria-pressed="false">Informes</button>
      <button type="button" id="p-inventario" aria-pressed="false">Inventario</button>
      <button type="button" id="p-revisar" aria-pressed="false">Revisar</button>
    </div>
    <div id="aviso" hidden></div>

    <div id="panel-hoy">
      <h2 class="dia-t">${esHoy ? "Hoy" : fechaLarga(t.fecha)}<span id="taller-resumen">${
        esc(resumenTaller())}</span></h2>
      <div class="filtros no-print">
        <label class="f">Día<input type="date" id="ta-fecha" value="${esc(t.fecha)}"></label>
        <label class="f">Grupo<select id="ta-grupo"><option value="">Todos</option>${
          grupos.map(g => `<option${t.grupo === g ? " selected" : ""}>${esc(g)}</option>`).join("")}</select></label>
        <button class="btn ghost chico" id="ta-hoy"${esHoy ? " disabled" : ""}>Hoy</button>
        <button class="btn ghost chico" id="ta-refrescar">Actualizar</button>
      </div>
      <div class="taller" id="taller-cuerpo">${filasTaller()}</div>
    </div>

    <div id="panel-informes" hidden>
      <div class="conmuta chico no-print" role="group" aria-label="Qué informe">
        ${[["estudiante","Por estudiante"],["grupo","Por grupo"],
           ["salon","Por salón"],["todo","Todas las hojas"]]
          .map(([k, t]) => `<button type="button" data-informe="${k}" aria-pressed="${
            estado.informe === k}">${t}</button>`).join("")}
      </div>
      <div id="cuerpo-informe"></div>
    </div>

    <div id="panel-inventario" hidden><div id="cuerpo-inventario"></div></div>
    <div id="panel-revisar" hidden><div id="cuerpo-revisar"></div></div>
  </div>`;
}

// La tabla de siempre: sirve para buscar por serial o mirar otras fechas,
// que es justo lo que el tablero del día no hace.
function vistaTablaTaller(){
  const filas = hojasConTodo();
  const grupos = [...new Set(filas.map(f => f.autor_grupo).filter(Boolean))].sort();
  const cuerpo = filasInstructor(filas);

  return `
    <p class="pista">${filas.length} diagnósticos registrados</p>
    <div class="filtros no-print">
      <label class="f">Grupo<select id="fi-grupo"><option value="">Todos</option>${
        grupos.map(g => `<option>${esc(g)}</option>`).join("")}</select></label>
      <label class="f">Veredicto<select id="fi-vered">
        <option value="">Todos</option><option value="apto">Apto</option>
        <option value="obs">Con observaciones</option><option value="no">No apto</option></select></label>
      <label class="f">Estado<select id="fi-estado">
        <option value="">Todos</option><option value="entregado">Entregado</option>
        <option value="borrador">Borrador</option></select></label>
      <label class="f">Buscar<input id="fi-texto" placeholder="serial, nombre…"></label>
    </div>
    <div class="tabla-envoltura">
      <table class="datos"><thead><tr>
        <th>Fecha</th><th>Estudiante</th><th>Grupo</th><th>Serial</th>
        <th>Equipo</th><th>Veredicto</th><th>B/O/F</th>
      </tr></thead><tbody id="tb">${cuerpo}</tbody></table>
    </div>`;
}

function montarInstructor(){
  $("#b-volver").onclick = () => {
    clearInterval(estado.latido); estado.latido = null;
    estado.vista = "panel"; pintar();
  };

  /* ---- pestañas ---- */
  const PESTANAS = ["hoy","informes","inventario","revisar"];
  const verPestana = async p => {
    estado.pestana = p;
    PESTANAS.forEach(x => {
      $("#p-" + x)?.setAttribute("aria-pressed", String(x === p));
      const panel = $("#panel-" + x);
      if(panel) panel.hidden = x !== p;
    });
    aviso("");
    if(p !== "hoy"){
      // los informes cruzan todo el taller: se baja una vez y sirve a las tres
      if(!estado.datos){
        const caja = $("#cuerpo-" + p);
        if(caja) caja.innerHTML = `<p class="vacio-chico">Cargando…</p>`;
        if(!(await cargarDatos())) return;
      }
      pintarPestana(p);
    }
  };
  PESTANAS.forEach(x => { const b = $("#p-" + x); if(b) b.onclick = () => verPestana(x); });
  if(estado.pestana !== "hoy") verPestana(estado.pestana);

  /* ---- el día ---- */
  $("#ta-fecha").addEventListener("change", () => {
    estado.taller.fecha = $("#ta-fecha").value || hoy();
    estado.vista = "instructor"; pintar(); cargarTaller();
  });
  $("#ta-grupo").addEventListener("input", () => {
    estado.taller.grupo = $("#ta-grupo").value; pintarTaller();
  });
  $("#ta-hoy").addEventListener("click", () => {
    estado.taller.fecha = hoy(); estado.vista = "instructor"; pintar(); cargarTaller();
  });
  $("#ta-refrescar").addEventListener("click", () => cargarTaller());

  // Mientras el tablero esté abierto se refresca solo: el instructor lo deja
  // puesto y camina por el taller. Solo el cuerpo, para no perderle el sitio.
  clearInterval(estado.latido);
  estado.latido = setInterval(() => {
    if(estado.vista === "instructor" && estado.pestana !== "todo") cargarTaller();
  }, 30000);

  pintarTaller();

  /* ---- informes ---- */
  app.querySelectorAll("[data-informe]").forEach(b => b.onclick = () => {
    estado.informe = b.dataset.informe;
    app.querySelectorAll("[data-informe]").forEach(x =>
      x.setAttribute("aria-pressed", String(x.dataset.informe === estado.informe)));
    pintarPestana("informes");
  });

}

// Los filtros de la tabla se enlazan cuando la tabla existe, que ahora es al
// abrir su informe y no al montar la vista entera.
function montarTablaTaller(){
  const filtrar = () => {
    const g = $("#fi-grupo").value, v = $("#fi-vered").value,
          e = $("#fi-estado").value, t = $("#fi-texto").value.toLowerCase();
    const vis = hojasConTodo().filter(f =>
      (!g || f.autor_grupo === g) &&
      (!v || f.veredicto === v) &&
      (!e || f.estado === e) &&
      (!t || `${f.equipo_serial} ${f.autor_nombre} ${f.autor_usuario} ${f.equipo_marca} ${f.equipo_modelo}`
              .toLowerCase().includes(t)));
    $("#tb").innerHTML = filasInstructor(vis);
    enlazarAjenas($("#tb"));
  };
  ["fi-grupo","fi-vered","fi-estado","fi-texto"].forEach(id =>
    $("#" + id)?.addEventListener("input", filtrar));
  enlazarAjenas($("#tb"));
}

// Al salir se borra lo guardado en este equipo: las máquinas del taller se
// comparten y el trabajo de uno no puede quedar en la sesión del que sigue.
// Por eso primero se intenta subir, y si algo queda pendiente se pregunta.
async function salir(){
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
function barra(){
  const p = estado.perfil;
  return `
  <header class="barra no-print"><div class="barra-in">
    <div class="marca"><strong>Bitácora de Diagnóstico</strong><span>${esc(NOMBRE_TALLER)}</span></div>
    ${p ? `<span class="conexion" id="conexion" hidden></span>
      <div class="quien"><b>${esc(p.nombre || p.usuario)}</b>${esc(p.usuario)}${
      p.rol === "instructor" ? " · instructor" : ""}</div>
      <button class="btn ghost chico" id="b-salir">Salir</button>` : ""}
  </div></header>`;
}

function pintar(){
  const vistas = { acceso: vistaAcceso, panel: vistaPanel, editor: vistaEditor,
                   reporte: vistaReporte, instructor: vistaInstructor, codigo: vistaCodigo };
  app.innerHTML = barra() + "<main>" + vistas[estado.vista]() + "</main>";
  $("#b-salir")?.addEventListener("click", salir);
  ({ acceso: montarAcceso, panel: montarPanel, editor: montarEditor,
     reporte: montarReporte, instructor: montarInstructor, codigo: montarCodigo })[estado.vista]();
  pintarConexion();
  window.scrollTo(0, 0);
}

if(SUPABASE_URL === "PENDIENTE"){
  app.innerHTML = `<main><div class="acceso"><h1>Falta configurar</h1>
    <p class="sub">Abre <code>app/config.js</code> y pon la URL y la llave anon de tu proyecto de Supabase.</p></div></main>`;
} else {
  iniciar();
}
