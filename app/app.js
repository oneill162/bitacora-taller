import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_URL, SUPABASE_ANON, DOMINIO_LOGIN, NOMBRE_TALLER } from "./config.js";
import { GRUPOS, PUNTOS, ESTADOS, VEREDICTOS, resumir } from "./protocolo.js";

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
  pendiente: null   // timeout de autoguardado
};

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

/* ================= arranque ================= */
async function iniciar(){
  const { data:{ session } } = await sb.auth.getSession();
  if(session) await cargarPerfil(session.user.id);
  else estado.vista = "acceso";
  pintar();

  sb.auth.onAuthStateChange(async (evt, ses) => {
    if(evt === "SIGNED_OUT"){
      estado.perfil = null; estado.vista = "acceso"; pintar();
    }
  });
}

async function cargarPerfil(id, reintento = 0){
  const { data, error } = await sb.from("perfiles").select("*").eq("id", id).maybeSingle();
  if(error){ aviso(explicar(error)); return; }
  // el perfil lo crea un trigger; en el primer registro puede tardar un instante
  if(!data && reintento < 3){
    await new Promise(r => setTimeout(r, 400));
    return cargarPerfil(id, reintento + 1);
  }
  estado.perfil = data;
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
        const { error } = await sb.functions.invoke("registro", {
          body: {
            usuario, password: clave,
            codigo:  $("#a-codigo").value.trim(),
            nombre:  $("#a-nombre").value.trim(),
            grupo:   $("#a-grupo").value.trim(),
            escuela: $("#a-escuela").value.trim()
          }
        });
        if(error){
          let msg = "No se pudo crear la cuenta. Revisa el internet y vuelve a intentar.";
          try { msg = (await error.context.json()).error || msg; } catch(_){}
          aviso(msg); btn.disabled = false; return;
        }
        // cuenta creada: entrar de una vez
        const { data, error: eEntrar } = await sb.auth.signInWithPassword({ email: correo, password: clave });
        if(eEntrar) throw eEntrar;
        await cargarPerfil(data.session.user.id);
      } else {
        const { data, error } = await sb.auth.signInWithPassword({ email: correo, password: clave });
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
async function cargarLista(){
  const { data, error } = await sb
    .from("diagnosticos")
    .select("id, orden, fecha, estado, veredicto, conteo, equipos(serial, marca, modelo)")
    .order("fecha", { ascending:false })
    .order("creado_en", { ascending:false })
    .limit(200);
  if(error){ aviso(explicar(error)); return; }
  estado.lista = data || [];
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
  const nuevo = async () => {
    const { data, error } = await sb.from("diagnosticos").insert({
      autor_id: estado.perfil.id,
      fecha: hoy(),
      orden: "DX-" + hoy().replace(/-/g,"").slice(2) + "-" + String(estado.lista.length + 1).padStart(2,"0")
    }).select().single();
    if(error){ aviso(explicar(error)); return; }
    await abrir(data.id);
  };
  $("#b-nuevo")?.addEventListener("click", nuevo);
  $("#b-nuevo-2")?.addEventListener("click", nuevo);
  $("#b-instructor")?.addEventListener("click", async () => {
    estado.vista = "instructor"; pintar(); await cargarInstructor();
  });
  app.querySelectorAll("[data-abrir]").forEach(b =>
    b.addEventListener("click", () => abrir(b.dataset.abrir)));
}

/* ================= editor ================= */
async function abrir(id){
  const [{ data: d, error: e1 }, { data: pts, error: e2 }] = await Promise.all([
    sb.from("diagnosticos").select("*, equipos(*)").eq("id", id).single(),
    sb.from("puntos").select("clave, estado, nota").eq("diagnostico_id", id)
  ]);
  if(e1 || e2){ aviso(explicar(e1 || e2)); return; }
  estado.diag = d;
  estado.equipo = d.equipos || null;
  estado.puntos = {};
  (pts || []).forEach(p => { estado.puntos[p.clave] = { estado: p.estado || "", nota: p.nota || "" }; });
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
    const { error } = await sb.from("diagnosticos").delete().eq("id", estado.diag.id);
    if(error){ aviso(explicar(error)); return; }
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

async function guardar(){
  const marca = $("#r-guardado");
  try{
    // 1) el equipo, si hay serial
    const serial = $("#e-serial")?.value.trim();
    let equipo_id = estado.diag.equipo_id;
    if(serial){
      const fila = { serial };
      CAMPOS_EQ.filter(c => c !== "serial").forEach(c => { fila[c] = $("#e-" + c).value.trim(); });
      if(!estado.equipo) fila.creado_por = estado.perfil.id;
      const { data: eq, error: eEq } = await sb.from("equipos")
        .upsert(fila, { onConflict: "serial" }).select().single();
      if(eEq) throw eEq;
      estado.equipo = eq;
      equipo_id = eq.id;
    }

    // 2) el encabezado del diagnóstico
    const r = resumir(estadosPlanos());
    const cambios = { equipo_id, veredicto: r.veredicto, conteo: r.conteo };
    CAMPOS_DIAG.forEach(c => { cambios[c] = $("#d-" + c).value; });
    const { data: d, error: eD } = await sb.from("diagnosticos")
      .update(cambios).eq("id", estado.diag.id).select().single();
    if(eD) throw eD;
    estado.diag = { ...estado.diag, ...d };

    // 3) los puntos tocados
    const filas = Object.keys(estado.puntos)
      .filter(k => estado.puntos[k].estado || estado.puntos[k].nota)
      .map(k => {
        const meta = PUNTOS.find(p => p.clave === k);
        return {
          diagnostico_id: estado.diag.id, clave: k,
          grupo: meta?.grupo || "", titulo: meta?.titulo || "",
          estado: estado.puntos[k].estado || "", nota: estado.puntos[k].nota || ""
        };
      });
    if(filas.length){
      const { error: eP } = await sb.from("puntos")
        .upsert(filas, { onConflict: "diagnostico_id,clave" });
      if(eP) throw eP;
    }
    if(marca) marca.textContent = "Guardado";
    aviso("");
  } catch(err){
    if(marca) marca.textContent = "Sin guardar";
    aviso(explicar(err));
  }
}

async function entregar(){
  clearTimeout(estado.pendiente);
  await guardar();
  const r = resumir(estadosPlanos());
  if(!r.completo && !confirm(`Quedan ${r.conteo.sin} puntos sin evaluar. ¿Entregar así?`)) return;
  const { data, error } = await sb.from("diagnosticos")
    .update({ estado: "entregado", entregado_en: new Date().toISOString(),
              veredicto: r.veredicto, conteo: r.conteo })
    .eq("id", estado.diag.id).select().single();
  if(error){ aviso(explicar(error)); return; }
  estado.diag = { ...estado.diag, ...data };
  estado.vista = "reporte";
  pintar();
}

/* ================= reporte ================= */
function vistaReporte(){
  const d = estado.diag, eq = estado.equipo || {}, p = estado.perfil;
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
      <button class="btn ghost chico" id="b-volver">Volver a mis diagnósticos</button>
      <button class="btn chico" id="b-imprimir">Imprimir o guardar PDF</button>
      ${d.estado === "entregado" ? '<button class="btn ghost chico" id="b-reabrir">Reabrir como borrador</button>' : ""}
    </div>
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
  $("#b-volver").onclick = async () => { await cargarLista(); estado.vista = "panel"; pintar(); };
  $("#b-imprimir").onclick = () => window.print();
  $("#b-reabrir")?.addEventListener("click", async () => {
    const { data, error } = await sb.from("diagnosticos")
      .update({ estado: "borrador", entregado_en: null }).eq("id", estado.diag.id).select().single();
    if(error){ aviso(explicar(error)); return; }
    estado.diag = { ...estado.diag, ...data };
    estado.vista = "editor"; pintar();
  });
}

/* ================= vista de instructor ================= */
async function cargarInstructor(){
  const { data, error } = await sb.from("vista_diagnosticos")
    .select("*").order("fecha", { ascending:false }).limit(500);
  if(error){ aviso(explicar(error)); return; }
  estado.todo = data || [];
  pintar();
}

function filasInstructor(filas){
  return filas.map(f => {
    const c = f.conteo || {};
    return `<tr>
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
  const filas = (estado.todo || []);
  const grupos = [...new Set(filas.map(f => f.autor_grupo).filter(Boolean))].sort();
  const cuerpo = filasInstructor(filas);

  return `
  <div class="pila">
    <div class="enc">
      <div><h1>Todo el taller</h1>
        <p>${filas.length} diagnósticos registrados</p></div>
      <button class="btn ghost" id="b-volver">Mis diagnósticos</button>
    </div>
    <div id="aviso" hidden></div>
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
    </div>
  </div>`;
}

function montarInstructor(){
  $("#b-volver").onclick = () => { estado.vista = "panel"; pintar(); };
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
  };
  ["fi-grupo","fi-vered","fi-estado","fi-texto"].forEach(id =>
    $("#" + id).addEventListener("input", filtrar));
}

/* ================= router ================= */
function barra(){
  const p = estado.perfil;
  return `
  <header class="barra no-print"><div class="barra-in">
    <div class="marca"><strong>Bitácora de Diagnóstico</strong><span>${esc(NOMBRE_TALLER)}</span></div>
    ${p ? `<div class="quien"><b>${esc(p.nombre || p.usuario)}</b>${esc(p.usuario)}${
      p.rol === "instructor" ? " · instructor" : ""}</div>
      <button class="btn ghost chico" id="b-salir">Salir</button>` : ""}
  </div></header>`;
}

function pintar(){
  const vistas = { acceso: vistaAcceso, panel: vistaPanel, editor: vistaEditor,
                   reporte: vistaReporte, instructor: vistaInstructor };
  app.innerHTML = barra() + "<main>" + vistas[estado.vista]() + "</main>";
  $("#b-salir")?.addEventListener("click", async () => { await sb.auth.signOut(); });
  ({ acceso: montarAcceso, panel: montarPanel, editor: montarEditor,
     reporte: montarReporte, instructor: montarInstructor })[estado.vista]();
  window.scrollTo(0, 0);
}

if(SUPABASE_URL === "PENDIENTE"){
  app.innerHTML = `<main><div class="acceso"><h1>Falta configurar</h1>
    <p class="sub">Abre <code>app/config.js</code> y pon la URL y la llave anon de tu proyecto de Supabase.</p></div></main>`;
} else {
  iniciar();
}
