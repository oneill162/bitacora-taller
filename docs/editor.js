import { GRUPOS, PUNTOS, ESTADOS, VEREDICTOS, resumir } from "./protocolo.js";
import * as local from "./local.js";
import * as inf from "./informes.js";
import { sb, $, app, estado, META_PUNTOS, esc, fechaLarga, val, aviso, explicar, esDeRed, conCorte, servidor, conectado, empujar, avisarPorCorreo } from "./nucleo.js";
import { pintar } from "./router.js";
import { cargarLista } from "./acceso.js";
import { cargarTaller } from "./tablero.js";
import { glifo } from "./campus.js";

/* ================= idioma de estados del punto =================
   Un punto se marca bien / observación / falla / no aplica. Los tres primeros usan los glifos de los veredictos
   (apto, obs, no) y los dos últimos —no aplica y sin evaluar— llevan un glifo propio que NO es de veredicto. */
const VEREDICTO_DE = { ok: "apto", obs: "obs", falla: "no" };
const G_NA  = '<svg class="g" viewBox="0 0 16 16" aria-hidden="true"><rect x="2" y="6.9" width="12" height="2.2" fill="currentColor"/></svg>';
const G_SIN = '<svg class="g" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.2" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>';
const glifoPunto = s => VEREDICTO_DE[s] ? glifo(VEREDICTO_DE[s]) : s === "na" ? G_NA : G_SIN;
const LARGO = Object.fromEntries(ESTADOS.map(s => [s.v, s.largo]));
const palabraPunto = s => LARGO[s] || "Sin evaluar";
const chipPunto = s => `<span class="estado" data-v="${VEREDICTO_DE[s] || (s ? "na" : "sin")}">${glifoPunto(s)}${esc(palabraPunto(s))}</span>`;
const chipVeredicto = v => v
  ? `<span class="estado estado-lg" data-v="${esc(v)}">${glifo(v)}${esc(VEREDICTOS[v])}</span>`
  : `<span class="estado estado-lg" data-v="sin">${G_SIN}${esc(VEREDICTOS[""])}</span>`;

/* ================= editor ================= */
export async function abrir(id){
  // Si hay señal se refresca desde Supabase, salvo que la copia de aquí
  // tenga cambios sin subir: en ese caso la buena es la de este equipo.
  if(conectado()){
    const [{ data: d, error: e1 }, { data: pts, error: e2 }] = await Promise.all([
      conCorte(sb.from("diagnosticos").select("*, equipos(*)").eq("id", id).single()),
      conCorte(sb.from("puntos").select("clave, grupo, titulo, estado, nota").eq("diagnostico_id", id))
    ]);
    if(d && !e1 && !e2) await local.espejarDiag(d, pts || [], d.equipos);
    else if(e1 || e2){ if(esDeRed(e1 || e2)) servidor.arriba = false; else aviso(explicar(e1 || e2)); }
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

export function vistaEditor(){
  const d = estado.diag, eq = estado.equipo || {};
  const grupos = GRUPOS.map((g, gi) => {
    const items = PUNTOS.filter(p => p.gi === gi).map(p => {
      const cur = estado.puntos[p.clave] || {};
      const segs = ESTADOS.map(s => `
        <input type="radio" name="${p.clave}" id="${p.clave}-${s.v}" value="${s.v}"
               data-punto="${p.clave}" ${cur.estado === s.v ? "checked" : ""}>
        <label for="${p.clave}-${s.v}">${glifoPunto(s.v)}<span>${s.corto}</span></label>`).join("");
      return `
      <div class="punto" data-e="${esc(cur.estado || "")}">
        <div class="punto-txt">
          <div class="punto-t">${esc(p.titulo)}</div>
          <div class="punto-h">${esc(p.ayuda)}</div>
        </div>
        <div class="seg" role="group" aria-label="Estado de: ${esc(p.titulo)}">${segs}</div>
        <input class="nota" data-nota="${p.clave}" value="${esc(cur.nota || "")}"
               placeholder="Nota u observación (opcional)" aria-label="Nota sobre: ${esc(p.titulo)}">
      </div>`;
    }).join("");
    return `
    <section class="cap ed-grupo${gi % 2 === 0 ? " campo-s2" : ""}" aria-labelledby="g-${g.n}">
      <div class="in">
        <h2 class="ed-gh" id="g-${g.n}"><i class="ed-gn">${g.n}</i><span>${esc(g.t)}</span></h2>
        <div class="ed-puntos">${items}</div>
      </div>
    </section>`;
  }).join("");

  return `
  <section class="cap campo ed-cab" aria-labelledby="h-hoja">
    <div class="in ed-cab-in">
      <div class="ed-cab-t">
        <h1 class="ed-titulo" id="h-hoja">Hoja de cotejo</h1>
        <p class="ed-sub">${esc(val(d.orden,"Sin número de orden"))} · ${esc(fechaLarga(d.fecha))}</p>
      </div>
      <div class="fila ed-cab-acc">
        <button class="btn sec chico" id="b-volver" type="button">Volver</button>
        <button class="btn peligro chico" id="b-borrar" type="button">Borrar</button>
      </div>
    </div>
  </section>

  <section class="cap ed-ficha" aria-label="Datos de la orden y del equipo">
    <div class="in">
      <div id="aviso" hidden role="status"></div>
      <div class="ed-bloque">
        <h2 class="h3">Orden</h2>
        <div class="ed-campos">
          <label class="campo-f">Orden núm.<input id="d-orden" value="${esc(d.orden)}" placeholder="DX-001"></label>
          <label class="campo-f">Fecha<input id="d-fecha" type="date" value="${esc(d.fecha)}"></label>
          <label class="campo-f">Usuario del equipo<input id="d-usuario_equipo" value="${esc(d.usuario_equipo)}" placeholder="Salón 204"></label>
          <label class="campo-f">Sistema operativo<input id="d-sistema" value="${esc(d.sistema)}" placeholder="Windows 11 Pro"></label>
        </div>
      </div>
      <div class="ed-bloque">
        <h2 class="h3">Equipo</h2>
        <div class="ed-campos">
          <label class="campo-f">Serial / service tag<input id="e-serial" value="${esc(eq.serial || "")}" placeholder="ABC1234">
            <span class="pista">El serial enlaza esta hoja con el historial del equipo.</span></label>
          <label class="campo-f">Marca<input id="e-marca" value="${esc(eq.marca || "")}" placeholder="Dell"></label>
          <label class="campo-f">Modelo<input id="e-modelo" value="${esc(eq.modelo || "")}" placeholder="OptiPlex 3080"></label>
          <label class="campo-f">Tipo<input id="e-tipo" value="${esc(eq.tipo || "")}" placeholder="Torre de escritorio"></label>
          <label class="campo-f">Núm. de inventario<input id="e-inventario" value="${esc(eq.inventario || "")}" placeholder="INV-00842"></label>
          <label class="campo-f">Ubicación<input id="e-ubicacion" value="${esc(eq.ubicacion || "")}" placeholder="Salón 204"></label>
        </div>
      </div>
    </div>
  </section>

  ${grupos}

  <section class="cap ed-grupo ed-cierre${GRUPOS.length % 2 === 0 ? " campo-s2" : ""}" aria-labelledby="g-cierre">
    <div class="in">
      <h2 class="ed-gh" id="g-cierre"><i class="ed-gn">—</i><span>Cierre</span></h2>
      <div class="ed-campos-cierre">
        <label class="campo-f">Acciones realizadas
          <textarea id="d-acciones" placeholder="Ej.: limpieza de disipador, DISM y sfc.">${esc(d.acciones)}</textarea></label>
        <label class="campo-f">Hallazgos y recomendaciones
          <textarea id="d-hallazgos" placeholder="Ej.: arranque lento, disco casi lleno.">${esc(d.hallazgos)}</textarea></label>
        <label class="campo-f">Próximo paso
          <select id="d-proximo_paso">
            ${["Devolver a uso normal","Programar mantenimiento preventivo","Enviar a reparación",
               "Solicitar pieza de repuesto","Retirar de servicio / reemplazar","Escalar al instructor"]
              .map(o => `<option${d.proximo_paso === o ? " selected" : ""}>${esc(o)}</option>`).join("")}
          </select></label>
      </div>
    </div>
  </section>

  <div class="resumen campo-oscuro no-print">
    <div class="in resumen-in">
      <div class="ed-estados">
        <div class="estado estado-lg" id="r-vered" data-v="sin">${G_SIN}Sin evaluar</div>
        <div class="estado estado-lg" id="r-inc" data-v="inc" hidden>${glifo("inc")}Incompleto</div>
      </div>
      <div class="ed-prog"><span class="progreso" id="r-prog">0/${PUNTOS.length}</span><span class="ed-barra" id="r-barra" aria-hidden="true"></span></div>
      <div class="ed-pie">
        <div class="guardado" id="r-guardado"></div>
        <details class="ed-falta" id="r-falta" hidden>
          <summary>${glifo("inc")}<span id="r-falta-n">Qué falta</span></summary>
          <ul id="r-falta-l"></ul>
        </details>
      </div>
      <button class="btn marca-b" id="b-entregar" type="button">Entregar</button>
    </div>
  </div>`;
}

export const CAMPOS_DIAG = ["orden","fecha","usuario_equipo","sistema","acciones","hallazgos","proximo_paso"];
export const CAMPOS_EQ   = ["serial","marca","modelo","tipo","inventario","ubicacion"];

export function montarEditor(){
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
  // El serial guarda al terminar (change), no en cada tecla: guardar crea un equipo por
  // serial, y a mitad de escribir cada pausa dejaba un equipo huérfano ("7", "7JQ", "7JQ4"…).
  CAMPOS_EQ.forEach(c => $("#e-" + c)?.addEventListener(c === "serial" ? "change" : "input",
    () => programarGuardado()));
  // pero «Qué falta» sí sigue lo que se escribe: repinta el resumen en cada tecla sin guardar nada
  $("#e-serial")?.addEventListener("input", () => pintarResumen());

  app.querySelectorAll("[data-punto]").forEach(r => r.addEventListener("change", () => {
    const clave = r.dataset.punto;
    estado.puntos[clave] = { ...(estado.puntos[clave] || {}), estado: r.value };
    r.closest(".punto").dataset.e = r.value;        // la barra de la izquierda del punto sigue al estado
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

export function estadosPlanos(){
  const o = {};
  Object.keys(estado.puntos).forEach(k => { if(estado.puntos[k].estado) o[k] = estado.puntos[k].estado; });
  return o;
}

// La barra de abajo: veredicto con su glifo, "Incompleto" cuando ya hay veredicto pero falta algo,
// el avance y la lista viva de lo que falta (lo mismo que dirá el reporte).
// Lo que le falta a la hoja tal como está en pantalla (la barra de abajo y el aviso al entregar dicen lo mismo).
function faltaAhora(r){
  const campo = id => $(id)?.value ?? "";
  return inf.faltantes(
    { conteo: r.conteo, sistema: campo("#d-sistema"), hallazgos: campo("#d-hallazgos"), orden: campo("#d-orden") },
    { serial: campo("#e-serial"), marca: campo("#e-marca"), modelo: campo("#e-modelo") }, r.total);
}

export function pintarResumen(){
  const v = $("#r-vered");
  if(!v) return;
  const r = resumir(estadosPlanos());
  v.setAttribute("data-v", r.veredicto || "sin");
  v.innerHTML = (r.veredicto ? glifo(r.veredicto) : G_SIN) + esc(VEREDICTOS[r.veredicto]);
  $("#r-inc").hidden = !(r.veredicto && !r.completo);
  $("#r-prog").textContent = `${r.evaluados}/${r.total}`;
  $("#r-barra").style.setProperty("--p", r.total ? r.evaluados / r.total : 0);
  const falta = faltaAhora(r);
  const caja = $("#r-falta");
  caja.hidden = !falta.length;
  $("#r-falta-n").textContent = `Qué falta (${falta.length})`;
  $("#r-falta-l").innerHTML = falta.map(t => `<li>${esc(t)}</li>`).join("");
}

export function programarGuardado(){
  const marca = $("#r-guardado");
  if(marca) marca.textContent = "Guardando…";
  pintarResumen();
  clearTimeout(estado.pendiente);
  estado.pendiente = setTimeout(guardar, 800);
}

// Guardar es escribir en el equipo del estudiante; subir es lo que viene
// después y puede esperar. Por eso ya no existe "Sin guardar": lo anotado
// no se pierde aunque el taller no tenga señal.
export async function guardar(){
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

export async function entregar(){
  clearTimeout(estado.pendiente);
  await guardar();
  const r = resumir(estadosPlanos());
  const falta = faltaAhora(r);
  if(falta.length && !confirm(`A esta hoja le falta: ${falta.join(", ")}. Si la entregas así queda Incompleta y no cuenta en el informe final. ¿Entregar así?`)) return;
  estado.diag = { ...estado.diag, estado: "entregado",
                  entregado_en: new Date().toISOString(),
                  veredicto: r.veredicto, conteo: r.conteo };
  await local.guardarDiag(estado.diag);
  const r2 = await empujar();
  if(r2.pendientes === 0) avisarPorCorreo("entregada", estado.diag.id);
  estado.vista = "reporte";
  pintar();
}

/* ================= reporte ================= */
export function vistaReporte(){
  // El técnico de la hoja es su autor, no quien la está mirando: si el
  // instructor abre la hoja de un estudiante, la firma sigue siendo del
  // estudiante.
  const d = estado.diag, eq = estado.equipo || {}, p = estado.autor || estado.perfil;
  const r = resumir(estadosPlanos());
  const c = d.conteo || r.conteo;
  const falta = inf.faltantes(d, eq, PUNTOS.length);
  const califica = estado.ajena && estado.perfil.rol === "instructor";
  const zonaAviso = '<div id="aviso" hidden role="status"></div>';

  const cuerpo = GRUPOS.map((g, gi) => {
    const filas = PUNTOS.filter(x => x.gi === gi).map(x => {
      const cur = estado.puntos[x.clave] || {};
      const s = cur.estado || "";
      return `<div class="rrow fila-v" data-v="${VEREDICTO_DE[s] || "sin"}">${chipPunto(s)}<span class="rt">${esc(x.titulo)}${
        cur.nota ? `<small>${esc(cur.nota)}</small>` : ""}</span></div>`;
    }).join("");
    return `<div class="rgrupo"><h3>${g.n} · ${esc(g.t)}</h3>${filas}</div>`;
  }).join("");

  const cuentas = [["ok", "Bien"], ["obs", "Observación"], ["falla", "Falla"], ["na", "No aplica"], ["sin", "Sin evaluar"]]
    .map(([k, t]) => `<li data-v="${VEREDICTO_DE[k] || k}">${glifoPunto(k)}<b class="num">${c[k] || 0}</b> ${t}</li>`).join("");

  return `
  <section class="cap campo ed-tool no-print" aria-label="Acciones de la hoja">
    <div class="in fila">
      <button class="btn sec chico" id="b-volver" type="button">${
        estado.ajena ? "Volver al taller" : "Volver a mis diagnósticos"}</button>
      <button class="btn marca-b chico" id="b-imprimir" type="button">Imprimir o guardar PDF</button>
      ${!estado.ajena && d.estado === "entregado"
        ? '<button class="btn sec chico" id="b-reabrir" type="button">Reabrir como borrador</button>' : ""}
    </div>
  </section>

  <section class="cap ed-estado" aria-label="Estado de la hoja">
    <div class="in">
      ${estado.ajena ? `<p class="ajena no-print">${glifo("info")}<span>Hoja de ${esc(val(p.nombre, p.usuario))}. Se mira sin editar; abajo la calificas o la borras.</span></p>` : ""}
      ${!estado.ajena && d.nota != null ? `<div class="nota-final">
        <div class="nota-n"><span class="nota-e">Nota del instructor</span><b class="nota-v">${esc(d.nota)}<small>/100</small></b></div>${
        d.comentario ? `<p class="nota-c">${esc(d.comentario)}</p>` : ""}</div>` : ""}
      ${falta.length ? `<div class="falta fila-v" data-v="inc">
        <span class="estado" data-v="inc">${glifo("inc")}Incompleto</span>
        <div><b>Falta culminar esta hoja.</b>
        <span>Queda por poner: ${esc(falta.join(", "))}.</span></div></div>` : ""}
      ${califica ? "" : zonaAviso}
    </div>
  </section>

  ${califica ? `
  <form id="f-nota" class="cap campo-s2 calificar no-print" aria-labelledby="h-calificar" novalidate>
    <div class="in ed-cal">
      <div class="ed-cal-h">
        <h2 class="h3" id="h-calificar">Calificar esta hoja</h2>
        <p class="suave">El estudiante ve la nota y el comentario en su hoja.</p>
      </div>
      <label class="campo-f">Nota (0–100)
        <input id="n-nota" type="number" min="0" max="100" step="0.01" inputmode="decimal" value="${esc(d.nota ?? "")}"></label>
      <label class="campo-f">Comentario para el estudiante
        <textarea id="n-comentario" rows="2">${esc(d.comentario || "")}</textarea></label>
      <div class="fila ed-cal-acc">
        <button class="btn chico" type="submit">Guardar nota</button>
        <button class="btn peligro chico" type="button" id="b-borrar-hoja">Borrar esta hoja</button>
      </div>
      ${zonaAviso}
    </div>
  </form>` : ""}

  <section class="cap campo-s2 ed-papel" aria-label="Hoja de diagnóstico">
    <div class="in">
    <article class="hoja">
      <div class="hoja-ident">
        <div class="placa-campus">
          <img class="pc-itpr" src="img/itpr-marca.webp" alt="Instituto Tecnológico de Puerto Rico" width="320" height="374">
          <img class="pc-sanjuan" src="img/tiburon.webp" alt="Tiburones, Recinto de San Juan" width="538" height="560">
          <img class="pc-manati" src="img/itpr-manati.webp" alt="Instituto Tecnológico de Puerto Rico, Manatí" width="800" height="365">
        </div>
        <div class="placa-depr"><img src="img/depr.webp" alt="Departamento de Educación, Gobierno de Puerto Rico" width="1000" height="323"></div>
        <p class="hoja-aval">Con el aval del Departamento de Educación</p>
      </div>
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
      <div class="rveredicto fila-v" data-v="${esc(d.veredicto || "sin")}">
        <div class="rv-t">${chipVeredicto(d.veredicto)}${falta.length ? `<span class="estado estado-lg" data-v="inc">${glifo("inc")}Incompleto</span>` : ""}</div>
        <ul class="rcuentas">${cuentas}</ul>
      </div>
      ${falta.length ? `<p class="falta-imp"><b>Falta culminar esta hoja.</b> Queda por poner: ${esc(falta.join(", "))}.</p>` : ""}
      ${cuerpo}
      <div class="rgrupo"><h3>Acciones realizadas</h3>
        ${d.acciones ? `<p class="prosa">${esc(d.acciones)}</p>` : '<p class="sinval">No se registraron acciones.</p>'}</div>
      <div class="rgrupo"><h3>Hallazgos y recomendaciones</h3>
        ${d.hallazgos ? `<p class="prosa">${esc(d.hallazgos)}</p>` : '<p class="sinval">No se registraron hallazgos.</p>'}</div>
      <div class="rgrupo"><h3>Próximo paso</h3><p class="prosa">${esc(val(d.proximo_paso))}</p></div>
      <div class="firmas">
        <div class="firma"><span class="firma-t">Firma del técnico</span><small>${esc(val(p.nombre, p.usuario))}</small></div>
        <div class="firma"><span class="firma-t">Firma del instructor</span><small>Nombre y fecha</small></div>
      </div>
    </article>
    </div>
  </section>`;
}

export function montarReporte(){
  $("#b-volver").onclick = async () => {
    if(estado.ajena){
      estado.ajena = false; estado.autor = estado.perfil; estado.diag = null;
      estado.vista = "instructor"; pintar(); await cargarTaller();
      return;
    }
    await cargarLista(); estado.vista = "panel"; pintar();
  };
  $("#b-imprimir").onclick = () => window.print();
  $("#f-nota")?.addEventListener("submit", async ev => {
    ev.preventDefault();
    const bruto = $("#n-nota").value.trim();
    const nota = bruto === "" ? null : Number(bruto);
    if(nota !== null && !(nota >= 0 && nota <= 100)){ aviso("La nota va de 0 a 100."); return; }
    const comentario = $("#n-comentario").value.trim();
    const { error } = await conCorte(sb.from("diagnosticos").update({ nota, comentario }).eq("id", estado.diag.id));
    if(error){ aviso(explicar(error)); return; }
    estado.diag = { ...estado.diag, nota, comentario };
    if(nota !== null) avisarPorCorreo("calificada", estado.diag.id);
    aviso("Nota guardada." + (nota !== null ? " Se le avisa al estudiante si tiene correo." : ""), "exito");
  });
  $("#b-borrar-hoja")?.addEventListener("click", async () => {
    if(!confirm("Se borra esta hoja del estudiante y todo lo anotado. No se deshace. ¿Seguro?")) return;
    const { error } = await conCorte(sb.from("diagnosticos").delete().eq("id", estado.diag.id));
    if(error){ aviso(explicar(error)); return; }
    estado.ajena = false; estado.autor = estado.perfil; estado.diag = null;
    estado.vista = "instructor"; pintar(); await cargarTaller();
  });
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
export const loQueFalta = h => inf.faltantes(h, h?.equipos, PUNTOS.length);
