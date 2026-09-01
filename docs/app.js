import { SUPABASE_URL, SUPABASE_ANON, DOMINIO_LOGIN, NOMBRE_TALLER } from "./config.js";
import { GRUPOS, PUNTOS, ESTADOS, VEREDICTOS, resumir } from "./protocolo.js";
import * as local from "./local.js";
import { avance, haceCuanto, filasTaller as armarFilas, resumenTaller as armarResumen } from "./taller.js";

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
  todo: [],         // lo de todo el taller, solo para el instructor
  autor: null,      // de quién es la hoja abierta; el instructor lee las ajenas
  ajena: false,     // la hoja abierta no es mía: se mira, no se toca
  taller: null,     // tablero del día: { fecha, grupo, estudiantes, hojas }
  pestana: "hoy",   // qué mira el instructor: hoy | todo
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
      estado.todo = []; estado.taller = null; estado.ajena = false; estado.autor = null;
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
          <input id="a-codigo" autocapitalize="characters" autocorrect="off" spellcheck="false"
                 placeholder="Te lo da el instructor">
          <span class="pista">Solo hace falta al crear la cuenta, no para entrar.</span>
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
  let modo = "entrar";
  const set = m => {
    modo = m;
    $("#m-entrar").setAttribute("aria-pressed", m === "entrar");
    $("#m-crear").setAttribute("aria-pressed", m === "crear");
    $("#extra").hidden = m !== "crear";
    $("#a-enviar").textContent = m === "crear" ? "Crear mi cuenta" : "Entrar";
    $("#a-clave").setAttribute("autocomplete", m === "crear" ? "new-password" : "current-password");
    aviso("");
  };
  $("#m-entrar").onclick = () => set("entrar");
  $("#m-crear").onclick  = () => set("crear");

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
      .select("id, orden, fecha, creado_en, estado, veredicto, conteo, equipos(serial, marca, modelo)")
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
      .select("id, autor_id, orden, estado, veredicto, conteo, actualizado_en, equipos(serial, marca, modelo)")
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
  return h.estado === "entregado"
    ? `<span class="pill" data-v="${esc(h.veredicto)}">${esc(VEREDICTOS[h.veredicto] || "Entregado")}</span>`
    : `<span class="cuando">${esc(haceCuanto(h.actualizado_en))}</span>`;
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
async function cargarInstructor(){
  if(!conectado()){
    estado.todo = []; pintar();
    aviso("Ver el taller completo necesita conexión. Tus hojas sí están aquí.");
    return;
  }
  const { data, error } = await conCorte(sb.from("vista_diagnosticos")
    .select("*").order("fecha", { ascending:false }).limit(500));
  if(error){ estado.todo = []; pintar(); aviso(explicar(error)); return; }
  estado.todo = data || [];
  pintar();
}

function filasInstructor(filas){
  return filas.map(f => {
    const c = f.conteo || {};
    return `<tr data-ajena="${esc(f.id)}" tabindex="0" role="button">
      <td class="num">${esc(f.fecha)}</td>
      <td>${esc(f.autor_nombre || f.autor_usuario)}</td>
      <td>${esc(f.autor_grupo || "—")}</td>
      <td class="num">${esc(f.equipo_serial || "—")}</td>
      <td>${esc(f.equipo_marca || "")} ${esc(f.equipo_modelo || "")}</td>
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
      <div><h1>El taller ${esHoy ? "hoy" : "el " + fechaLarga(t.fecha)}</h1>
        <p id="taller-resumen">${esc(resumenTaller())}</p></div>
      <button class="btn ghost" id="b-volver">Mis diagnósticos</button>
    </div>
    <div class="conmuta no-print" role="group" aria-label="Qué mirar">
      <button type="button" id="p-hoy" aria-pressed="true">El día</button>
      <button type="button" id="p-todo" aria-pressed="false">Buscar en todo</button>
    </div>
    <div id="aviso" hidden></div>

    <div id="panel-hoy">
      <div class="filtros no-print">
        <label class="f">Día<input type="date" id="ta-fecha" value="${esc(t.fecha)}"></label>
        <label class="f">Grupo<select id="ta-grupo"><option value="">Todos</option>${
          grupos.map(g => `<option${t.grupo === g ? " selected" : ""}>${esc(g)}</option>`).join("")}</select></label>
        <button class="btn ghost chico" id="ta-hoy"${esHoy ? " disabled" : ""}>Hoy</button>
        <button class="btn ghost chico" id="ta-refrescar">Actualizar</button>
      </div>
      <div class="taller" id="taller-cuerpo">${filasTaller()}</div>
    </div>

    <div id="panel-todo" hidden>
      ${vistaTablaTaller()}
    </div>
  </div>`;
}

// La tabla de siempre: sirve para buscar por serial o mirar otras fechas,
// que es justo lo que el tablero del día no hace.
function vistaTablaTaller(){
  const filas = (estado.todo || []);
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
  const verPestana = p => {
    estado.pestana = p;
    $("#p-hoy").setAttribute("aria-pressed", p === "hoy");
    $("#p-todo").setAttribute("aria-pressed", p === "todo");
    $("#panel-hoy").hidden  = p !== "hoy";
    $("#panel-todo").hidden = p !== "todo";
    aviso("");
    if(p === "todo" && !(estado.todo || []).length) cargarInstructor();
  };
  $("#p-hoy").onclick  = () => verPestana("hoy");
  $("#p-todo").onclick = () => verPestana("todo");
  if(estado.pestana === "todo") verPestana("todo");

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

  /* ---- buscar en todo ---- */
  const filtrar = () => {
    const g = $("#fi-grupo").value, v = $("#fi-vered").value,
          e = $("#fi-estado").value, t = $("#fi-texto").value.toLowerCase();
    const vis = (estado.todo || []).filter(f =>
      (!g || f.autor_grupo === g) &&
      (!v || f.veredicto === v) &&
      (!e || f.estado === e) &&
      (!t || `${f.equipo_serial} ${f.autor_nombre} ${f.autor_usuario} ${f.equipo_marca} ${f.equipo_modelo}`
              .toLowerCase().includes(t)));
    $("#tb").innerHTML = filasInstructor(vis);
    enlazarAjenas($("#tb"));
  };
  ["fi-grupo","fi-vered","fi-estado","fi-texto"].forEach(id =>
    $("#" + id).addEventListener("input", filtrar));
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
                   reporte: vistaReporte, instructor: vistaInstructor };
  app.innerHTML = barra() + "<main>" + vistas[estado.vista]() + "</main>";
  $("#b-salir")?.addEventListener("click", salir);
  ({ acceso: montarAcceso, panel: montarPanel, editor: montarEditor,
     reporte: montarReporte, instructor: montarInstructor })[estado.vista]();
  pintarConexion();
  window.scrollTo(0, 0);
}

if(SUPABASE_URL === "PENDIENTE"){
  app.innerHTML = `<main><div class="acceso"><h1>Falta configurar</h1>
    <p class="sub">Abre <code>app/config.js</code> y pon la URL y la llave anon de tu proyecto de Supabase.</p></div></main>`;
} else {
  iniciar();
}
