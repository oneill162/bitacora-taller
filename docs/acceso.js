import { DOMINIO_LOGIN, NOMBRE_TALLER } from "./config.js";
import { VEREDICTOS } from "./protocolo.js";
import * as local from "./local.js";
import { sb, $, app, estado, esc, hoy, fechaLarga, val, aviso, explicar, esDeRed, conCorte, servidor, conectado, empujar } from "./nucleo.js";
import { cargarPerfil, pintar } from "./router.js";
import { abrir, guardar, loQueFalta } from "./editor.js";
import { cargarCodigoClase } from "./codigo.js";
import { cargarTaller } from "./tablero.js";

/* ================= acceso ================= */
export function vistaAcceso(){
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

export function montarAcceso(){
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
export async function cargarLista(){
  if(conectado()){
    const { data, error } = await conCorte(sb
      .from("diagnosticos")
      .select("id, orden, fecha, creado_en, estado, veredicto, conteo, sistema, hallazgos, equipos(serial, marca, modelo)")
      .order("fecha", { ascending:false })
      .order("creado_en", { ascending:false })
      .limit(200));
    if(error){ if(esDeRed(error)) servidor.arriba = false; else aviso(explicar(error)); }
    else await local.espejarLista(data || []);
  }
  estado.lista = await local.listaLocal();
  estado.porSubir = await local.porSubir();
  estado.enLinea = conectado();
}

export function vistaPanel(){
  const p = estado.perfil;
  const filas = estado.lista.map(d => {
    const eq = d.equipos;
    const equipo = eq ? `${val(eq.marca,"")} ${val(eq.modelo,"")}`.trim() || eq.serial : "Equipo sin identificar";
    const c = d.conteo || {};
    return `
    <button class="tarjeta${d.estado === "entregado" && loQueFalta(d).length ? " fila-falta" : ""}" data-abrir="${d.id}" data-v="${esc(d.veredicto)}">
      <span class="orden">${esc(val(d.orden,"—"))}</span>
      <span class="tit">${esc(equipo)}
        <small>${esc(fechaLarga(d.fecha))}${eq ? " · " + esc(eq.serial) : ""}</small>
      </span>
      <span class="pill${d.estado === "borrador" ? " borrador" : ""}" data-v="${esc(d.estado === "borrador" ? "" : d.veredicto)}">
        ${d.estado === "borrador" ? "Borrador" : esc(VEREDICTOS[d.veredicto] || "—")}
      </span>
      ${d.estado === "entregado" && loQueFalta(d).length
        ? `<span class="pill falta-pill" title="${esc("Falta: " + loQueFalta(d).join(", "))}">! Falta</span>` : ""}
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

export function montarPanel(){
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
export async function abrirAjena(id){
  if(!conectado()){ aviso("Leer la hoja de un estudiante necesita conexión."); return; }
  const [{ data: d, error: e1 }, { data: pts, error: e2 }] = await Promise.all([
    conCorte(sb.from("diagnosticos").select("*, equipos(*), perfiles(usuario, nombre, grupo, escuela)")
      .eq("id", id).single()),
    conCorte(sb.from("puntos").select("clave, estado, nota").eq("diagnostico_id", id))
  ]);
  if(e1 || e2 || !d){
    if(esDeRed(e1 || e2)) servidor.arriba = false;
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
