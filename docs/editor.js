import { GRUPOS, PUNTOS, ESTADOS, VEREDICTOS, resumir } from "./protocolo.js";
import * as local from "./local.js";
import * as inf from "./informes.js";
import { sb, $, app, estado, META_PUNTOS, esc, fechaLarga, val, ETQ, aviso, explicar, esDeRed, conCorte, servidor, conectado, empujar, avisarPorCorreo } from "./nucleo.js";
import { pintar } from "./router.js";
import { cargarLista } from "./acceso.js";
import { cargarTaller } from "./tablero.js";

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

export function estadosPlanos(){
  const o = {};
  Object.keys(estado.puntos).forEach(k => { if(estado.puntos[k].estado) o[k] = estado.puntos[k].estado; });
  return o;
}

export function pintarResumen(){
  const r = resumir(estadosPlanos());
  const v = $("#r-vered");
  if(!v) return;
  let txt = VEREDICTOS[r.veredicto];
  if(r.veredicto && !r.completo) txt += " · incompleto";
  v.textContent = txt;
  v.setAttribute("data-v", r.veredicto);
  $("#r-prog").textContent = `${r.evaluados}/${r.total}`;
}

export function programarGuardado(){
  const marca = $("#r-guardado");
  if(marca) marca.textContent = "Guardando…";
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
  if(!r.completo && !confirm(`Quedan ${r.conteo.sin} puntos sin evaluar. ¿Entregar así?`)) return;
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
    ${estado.ajena ? `<p class="ajena no-print">Hoja de ${esc(val(p.nombre, p.usuario))}. Se mira sin editar; abajo la calificas o la borras.</p>` : ""}
    ${estado.ajena && estado.perfil.rol === "instructor" ? `
    <form id="f-nota" class="calificar no-print">
      <label class="f">Nota (0–100)
        <input id="n-nota" type="number" min="0" max="100" step="0.01" value="${esc(d.nota ?? "")}"></label>
      <label class="f">Comentario para el estudiante
        <textarea id="n-comentario" rows="2">${esc(d.comentario || "")}</textarea></label>
      <div class="fila">
        <button class="btn chico" type="submit">Guardar nota</button>
        <button class="btn peligro chico" type="button" id="b-borrar-hoja">Borrar esta hoja</button>
      </div>
    </form>` : ""}
    ${!estado.ajena && d.nota != null ? `<div class="nota-final"><b>Nota: ${esc(d.nota)}</b>${
      d.comentario ? `<p>${esc(d.comentario)}</p>` : ""}</div>` : ""}
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
