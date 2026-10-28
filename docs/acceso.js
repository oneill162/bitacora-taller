import { DOMINIO_LOGIN } from "./config.js";
import { VEREDICTOS } from "./protocolo.js";
import * as local from "./local.js";
import { sb, $, app, estado, esc, hoy, fechaLarga, val, aviso, explicar, esDeRed, conCorte, servidor, conectado, empujar } from "./nucleo.js";
import { cargarPerfil, pintar } from "./router.js";
import { abrir, loQueFalta } from "./editor.js";
import { cargarCodigoClase } from "./codigo.js";
import { cargarTaller } from "./tablero.js";
import { RECINTOS, recintoActual, recintoRecordado, cambiarRecinto, tilesRecinto, selectorRecinto, ilustracion, placaHero, lemaHero, chipEstado, glifo } from "./campus.js";

/* ================= acceso ================= */
// El titular de la entrada cambia con el recinto. Los tres están en el marcado y el CSS muestra el del recinto
// activo: cambiar de recinto no vuelve a pintar nada (y el titular nuevo sube de su propia línea al aparecer).
const TITULOS = Object.fromEntries(Object.values(RECINTOS).map(r => [r.id, r.titulo]));
const FLECHA = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';

let tiles, selector;

export function vistaAcceso(){
  tiles = tilesRecinto();
  selector = selectorRecinto();
  const titulos = Object.entries(TITULOS).map(([id, [a, b]]) => `
        <h1 class="h1 e-h1" data-t="${id}"><span class="sr">Bitácora de diagnóstico. </span><span class="linea"><span>${esc(a)}</span></span> <span class="linea"><span>${esc(b)}</span></span></h1>`).join("");
  // «Sin elegir» existe para que lo que el equipo solo recuerda (el recinto de quien lo usó antes) no pase al perfil de otra persona
  const opciones = '<option value="">Sin elegir</option>' + Object.values(RECINTOS).map(r =>
    `<option value="${r.id}">${esc(r.nombre)} · ${esc(r.mascota)}</option>`).join("");
  return `
  <div class="entrada-cuerpo${recintoRecordado() ? " recordado" : ""}">
    <div class="e-izq cap campo-oscuro">
      <div class="e-tope">
        <span class="sello"><img src="img/itpr-marca.webp" alt="Instituto Tecnológico de Puerto Rico" width="28" height="33"></span>
        <b class="e-nombre">Bitácora de diagnóstico</b>
        <div class="e-acc">
          ${selector.html}
          <button class="ic-btn ic-modo" type="button" data-modo-btn aria-label="Modo oscuro" aria-pressed="false">
            <svg class="luna" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>
            <svg class="sol" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6"/></svg>
          </button>
        </div>
      </div>
      <div class="e-hero">
        ${ilustracion()}
        ${titulos}
        <p class="lead e-lead rev">Registra, revisa y entrega el diagnóstico de cada computadora del taller del Instituto Tecnológico de Puerto Rico. <span class="e-casa">Aquí, <b data-r="largo">${esc(RECINTOS[recintoActual()].largo)}</b> es tu casa.</span><span class="e-elige">Elige tu recinto para empezar.</span></p>
        ${placaHero()}
      </div>
      ${tiles.html}
    </div>

    <div class="e-der cap">
      <div class="e-form" data-modo="entrar">
        <h2 class="h2 rev" id="e-titulo">Entra a tu bitácora</h2>
        <p class="suave rev" id="e-sub">Lo que empieces aquí se guarda en el teléfono aunque no haya señal.</p>
        <div class="conmuta rev" role="group" aria-label="Entrar o crear cuenta">
          <button type="button" id="m-entrar" aria-pressed="true">Entrar</button>
          <button type="button" id="m-crear" aria-pressed="false">Crear cuenta</button>
        </div>
        <div id="aviso" hidden role="status"></div>
        <form id="f-acceso" class="e-campos" autocomplete="on">
          <label class="campo-f rev">Usuario
            <input id="a-usuario" name="username" autocomplete="username" autocapitalize="none" autocorrect="off"
                   spellcheck="false" required placeholder="lrivera">
            <span class="pista solo-crear">Solo minúsculas, números, punto o guion.</span>
          </label>
          <label class="campo-f rev">Contraseña
            <input id="a-clave" name="password" type="password" required minlength="6"
                   autocomplete="current-password" placeholder="Mínimo 6 caracteres">
          </label>
          <div id="extra" hidden class="e-campos">
            <label class="campo-f">Código de clase
              <input id="a-codigo" inputmode="numeric" autocorrect="off" spellcheck="false"
                     placeholder="Te lo da el instructor">
              <span class="pista">Lo escribes tú. Solo hace falta al crear la cuenta, no para entrar.</span>
            </label>
            <label class="campo-f">Nombre completo
              <input id="a-nombre" autocomplete="name" placeholder="Luis Rivera"></label>
            <label class="campo-f">Grupo o sección
              <input id="a-grupo" placeholder="Tec. de Sistemas 4-B"></label>
            <label class="campo-f">Escuela
              <input id="a-escuela" placeholder="Nombre del plantel"></label>
            <label class="campo-f">Recinto
              <select id="a-recinto">${opciones}</select>
              <span class="pista">Cambia los colores de toda la bitácora. Puedes cambiarlo cuando quieras.</span>
            </label>
            <label class="campo-f">Correo (opcional)
              <input id="a-email" type="email" autocomplete="email" placeholder="para recibir avisos">
              <span class="pista">Solo para avisarte cuando entregues o te califiquen. Puedes ponerlo después.</span></label>
            <div class="opcion">
              <label class="opcion-l"><input type="checkbox" id="a-instructor"><span>Quiero ser instructor</span></label>
              <span class="pista">Es una solicitud: sigues como estudiante hasta que el administrador la apruebe.</span>
            </div>
          </div>
          <div class="rev"><button type="submit" class="btn ancho" id="a-enviar"><span id="a-enviar-t">Entrar</span>${FLECHA}</button></div>
        </form>
      </div>
      <div class="e-aval rev">
        <div class="placa-depr"><img src="img/depr.webp" alt="Departamento de Educación, Gobierno de Puerto Rico" width="1000" height="323"></div>
        <p>División Técnica y Vocacional, con el aval del Departamento de Educación de Puerto Rico.</p>
      </div>
    </div>
  </div>`;
}

export function montarAcceso(){
  tiles?.montar();
  selector?.montar();
  // El QR abre directo en "Crear cuenta", pero nunca trae el código: el
  // estudiante lo teclea a mano, dictado o proyectado por el instructor.
  const desdeQR = new URLSearchParams(location.search).has("nuevo");
  let modo = desdeQR ? "crear" : "entrar";
  const set = m => {
    modo = m;
    $("#m-entrar").setAttribute("aria-pressed", m === "entrar");
    $("#m-crear").setAttribute("aria-pressed", m === "crear");
    $("#extra").hidden = m !== "crear";
    $(".e-form").dataset.modo = m;
    $("#e-titulo").textContent = m === "crear" ? "Crea tu cuenta" : "Entra a tu bitácora";
    $("#e-sub").textContent = m === "crear"
      ? "Necesitas el código de clase que te da el instructor."
      : "Lo que empieces aquí se guarda en el teléfono aunque no haya señal.";
    // El navegador no puede enfocar un campo escondido, así que la obligación
    // se pone y se quita con el modo, no en el HTML.
    $("#a-codigo").required = m === "crear";
    $("#a-enviar-t").textContent = m === "crear" ? "Crear mi cuenta" : "Entrar";
    $("#a-clave").setAttribute("autocomplete", m === "crear" ? "new-password" : "current-password");
    aviso("");
  };
  $("#m-entrar").onclick = () => set("entrar");
  $("#m-crear").onclick  = () => set("crear");

  // El recinto del registro es el mismo que el de las tarjetas: elegir en uno mueve el otro.
  const selR = $("#a-recinto");
  const alinear = () => { selR.value = recintoRecordado() ? recintoActual() : ""; };
  alinear();
  selR.onchange = () => { if(selR.value) cambiarRecinto(selR.value, selR); };
  const vigila = new MutationObserver(() => {
    if(!selR.isConnected){ vigila.disconnect(); return; }
    alinear();
  });
  vigila.observe(document.documentElement, { attributes: true, attributeFilter: ["data-recinto"] });

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
            escuela: $("#a-escuela").value.trim(),
            email:   $("#a-email").value.trim(),
            recinto: $("#a-recinto").value,
            solicita_instructor: $("#a-instructor").checked
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
      .select("id, orden, fecha, creado_en, estado, veredicto, conteo, sistema, hallazgos, nota, comentario, equipos(serial, marca, modelo)")
      .eq("autor_id", estado.perfil.id)   // un instructor puede leer todo, pero «Mis hojas» son las suyas; las de los estudiantes salen del tablero
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

// Una fila de Mis hojas. El estado se dice con forma + glifo + palabra (campus.js chipEstado) y la barra de la
// izquierda (.fila-v): una entregada con datos sin llenar es "Incompleto" y no entra al informe final.
function filaHoja(d){
  const eq = d.equipos;
  const equipo = eq ? `${val(eq.marca,"")} ${val(eq.modelo,"")}`.trim() || eq.serial : "Equipo sin identificar";
  const falta = d.estado === "entregado" ? loQueFalta(d) : [];
  const grupo = d.estado === "borrador" ? "bor" : falta.length ? "inc" : "ent";
  const v = grupo === "bor" ? "bor" : grupo === "inc" ? "inc" : (VEREDICTOS[d.veredicto] ? d.veredicto : "sin");
  const chip = v === "sin" ? '<span class="estado" data-v="sin">Sin evaluar</span>'
    : chipEstado(v, v === "bor" ? "Borrador" : v === "inc" ? "Incompleto" : VEREDICTOS[v]);
  const nota = d.nota != null
    ? `<span class="nota" title="Nota del instructor"><b>${esc(d.nota)}</b><small>/100</small></span>`
    : grupo === "ent" ? '<span class="nota sin-nota">Sin calificar</span>' : '<span class="nota"></span>';
  return `
    <div class="rev" data-g="${grupo}">
    <button type="button" class="tarjeta fila-v" data-abrir="${esc(d.id)}" data-v="${v}">
      <span class="orden">${esc(val(d.orden,"—"))}</span>
      <span class="tit">${esc(equipo)}
        <small>${esc(fechaLarga(d.fecha))}${eq ? " · " + esc(eq.serial) : ""}</small>
      </span>
      <span class="v-celda">${chip}${falta.length ? `<small class="t-falta">Falta: ${esc(falta.join(", "))}</small>` : ""}</span>
      ${nota}
    </button></div>`;
}

export function vistaPanel(){
  const p = estado.perfil;
  const n = estado.lista.length;
  const grupos = { ent: 0, inc: 0, bor: 0 };
  estado.lista.forEach(d => {
    grupos[d.estado === "borrador" ? "bor" : d.estado === "entregado" && loQueFalta(d).length ? "inc" : "ent"]++;
  });
  const sub = `${n} ${n === 1 ? "hoja" : "hojas"} en la bitácora${grupos.inc ? ` · ${grupos.inc} por completar` : ""}`;
  const filtros = n >= 3 ? `
      <div class="pestanas rev" id="filtros-hojas" role="group" aria-label="Filtrar mis hojas">
        <button type="button" data-f="todas" aria-pressed="true">Todas <small>${n}</small></button>
        <button type="button" data-f="inc" aria-pressed="false">Incompletas <small>${grupos.inc}</small></button>
        <button type="button" data-f="bor" aria-pressed="false">Borradores <small>${grupos.bor}</small></button>
        <button type="button" data-f="ent" aria-pressed="false">Entregadas <small>${grupos.ent}</small></button>
      </div>` : "";

  return `
  <section class="cap hero campo hero-chico" aria-labelledby="h-hojas">
    ${ilustracion()}
    <div class="in hero-in">
      <div class="hero-txt">
        ${lemaHero()}
        <h1 class="h1" id="h-hojas"><span class="linea"><span>Mis</span></span> <span class="linea"><span>hojas</span></span></h1>
        <p class="hero-sub rev">${esc(sub)}</p>
        <div class="hero-acc rev">
          <button class="btn marca-b" type="button" id="b-nuevo">Nuevo diagnóstico<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg></button>
          ${p.rol === "instructor" ? '<button class="btn sec" type="button" id="b-codigo">Código para entrar</button>' : ""}
          ${p.rol === "instructor" ? '<button class="btn sec" type="button" id="b-instructor">Ver todo el grupo</button>' : ""}
        </div>
      </div>
    </div>
    ${placaHero()}
  </section>

  <section class="cap lista-cap" aria-labelledby="h-lista">
    <div class="in">
      ${p.solicita_instructor && p.rol !== "instructor"
        ? `<p class="aviso-info rev">${glifo("info")}<span>Tu solicitud para ser instructor espera la aprobación del administrador.</span></p>` : ""}
      <h2 class="h2 rev" id="h-lista">${n ? "Tus diagnósticos" : "Tu bitácora está vacía"}</h2>
      ${filtros}
      ${n
        ? `<div class="tarjetas" id="lista-hojas">${estado.lista.map(filaHoja).join("")}</div>
           <p class="vacio-f pista" id="vacio-f" hidden>No hay hojas de ese tipo.</p>`
        : `<div class="vacio rev">
             <p>Todavía no has registrado ningún diagnóstico.</p>
             <button class="btn" type="button" id="b-nuevo-2">Empezar el primero${FLECHA}</button>
           </div>`}
    </div>
  </section>

  <section class="cap campo-s2 correo-cap no-print" aria-labelledby="h-correo">
    <div class="in correo-in">
      <div class="correo-txt rev">
        <h2 class="h3" id="h-correo">Avisos por correo</h2>
        <p class="pista">Solo para avisarte cuando entregues o te califiquen. Puedes quitarlo cuando quieras.</p>
      </div>
      <div class="correo-forma rev">
        <div id="aviso" hidden role="status"></div>
        <form id="f-correo" class="correo">
          <label class="campo-f">Mi correo para avisos
            <input id="p-email" type="email" autocomplete="email" value="${esc(p.email || "")}" placeholder="tu@correo.com"></label>
          <button class="btn" type="submit">Guardar correo</button>
        </form>
      </div>
    </div>
  </section>`;
}

// La hoja nace en el equipo del estudiante, con su id ya puesto. Así se
// puede empezar un diagnóstico en un taller sin señal y subirlo después:
// el id no lo tiene que inventar Supabase.
export async function nuevoDiagnostico(){
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
}

export function montarPanel(){
  // La hoja nace en el equipo del estudiante, con su id ya puesto. Así se
  // puede empezar un diagnóstico en un taller sin señal y subirlo después:
  // el id no lo tiene que inventar Supabase.
  $("#b-nuevo")?.addEventListener("click", nuevoDiagnostico);
  $("#b-nuevo-2")?.addEventListener("click", nuevoDiagnostico);
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
  $("#f-correo")?.addEventListener("submit", async ev => {
    ev.preventDefault();
    const email = $("#p-email").value.trim();
    if(!conectado()){ aviso("Guardar el correo necesita conexión."); return; }
    const { error } = await conCorte(sb.from("perfiles").update({ email }).eq("id", estado.perfil.id));
    if(error){ aviso(/check|email/i.test(error.message) ? "Ese correo no es válido." : explicar(error)); return; }
    estado.perfil.email = email;
    await local.guardarMeta("perfil", estado.perfil);
    aviso(email ? "Correo guardado. Te avisaremos ahí." : "Quitaste tu correo: no recibirás avisos.", "exito");
  });
  app.querySelectorAll("[data-abrir]").forEach(b =>
    b.addEventListener("click", () => abrir(b.dataset.abrir)));
  // filtros de la lista: solo esconden filas, no vuelven a pintar
  app.querySelectorAll("#filtros-hojas [data-f]").forEach(b => b.addEventListener("click", () => {
    const f = b.dataset.f;
    app.querySelectorAll("#filtros-hojas [data-f]").forEach(x => x.setAttribute("aria-pressed", String(x === b)));
    let visibles = 0;
    app.querySelectorAll("#lista-hojas [data-g]").forEach(fila => {
      const ver = f === "todas" || fila.dataset.g === f;
      fila.hidden = !ver;
      if(ver) visibles++;
    });
    $("#vacio-f").hidden = visibles > 0;
  }));
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
