import { NOMBRE_TALLER } from "./config.js";
import { PUNTOS, VEREDICTOS } from "./protocolo.js";
import * as inf from "./informes.js";
import { sb, $, app, estado, esc, hoy, fechaLarga, val, aviso, explicar, esDeRed, conCorte, servidor, conectado , ICONO_FALTA } from "./nucleo.js";
import { barra, pintar } from "./router.js";
import { abrir, entregar } from "./editor.js";
import { cargarTaller, filasTaller, resumenTaller, enlazarAjenas, pintarTaller } from "./tablero.js";

/* ================= informes, inventario y duplicados ================= */
// Una sola bajada para las tres pestañas: son las mismas tablas cruzadas de
// distintas maneras, y pedirlas por separado tres veces no ayuda a nadie.
export async function cargarDatos(){
  if(!conectado()){
    aviso("Los informes necesitan conexión: el trabajo de los demás no se guarda en tu equipo.");
    return false;
  }
  const [{ data: gente, error: e1 }, { data: eqs, error: e2 }, { data: hojas, error: e3 }] =
    await Promise.all([
      conCorte(sb.from("perfiles").select("id, usuario, nombre, grupo, escuela, rol, email, solicita_instructor, es_superusuario")),
      conCorte(sb.from("equipos").select("*")),
      conCorte(sb.from("diagnosticos")
        .select("id, autor_id, equipo_id, orden, fecha, estado, veredicto, conteo, sistema, hallazgos, actualizado_en, nota")
        .order("fecha", { ascending:false }).limit(2000))
    ]);
  const err = e1 || e2 || e3;
  if(err){ if(esDeRed(err)) servidor.arriba = false; aviso(explicar(err)); return false; }

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
export function graficaTrabajo(filas){
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
export const tabla = (encabezados, filas) => `
  <div class="tabla-envoltura">
    <table class="datos">
      <thead><tr>${encabezados.map(h => `<th>${esc(h)}</th>`).join("")}</tr></thead>
      <tbody>${filas}</tbody>
    </table>
  </div>`;

export function informePorEstudiante(){
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
    <td class="num">${f.promedio == null ? "—" : f.promedio}</td>
    <td class="num">${esc(f.ultima || "—")}</td>
  </tr>`).join("");
  return graficaTrabajo(filas) +
    tabla(["Estudiante","Grupo","Hojas","Entregadas","Sin entregar","Puntos evaluados",
           "Fallas halladas","Sin culminar","Nota media","Última"], cuerpo);
}

// Lo que entra al informe final: sin las hojas entregadas a medias.
const finales = () => inf.soloFinales(estado.datos.diagnosticos, estado.datos.eqPorId, PUNTOS.length);
const filasIncompletas = () => inf.incompletos(estado.datos.equipos, estado.datos.diagnosticos, PUNTOS.length);

function notaExcluidas(){
  const n = estado.datos.diagnosticos.length - finales().length;
  return n ? `<p class="aviso-falta">${ICONO_FALTA} ${n} ${n === 1 ? "hoja incompleta no está incluida" : "hojas incompletas no están incluidas"}
    en este informe. Mira el informe <b>Incompletos</b>.</p>` : "";
}

export function informePorGrupo(){
  const d = estado.datos;
  const filas = inf.porGrupo(d.estudiantes, finales(), PUNTOS.length);
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
  return notaExcluidas() + tabla(["Grupo","Han trabajado","Hojas","Entregadas","Puntos evaluados",
                "Fallas","Equipos no aptos","Última"], cuerpo);
}

export function informePorSalon(){
  const d = estado.datos;
  const filas = inf.porSalon(d.equipos, finales(), PUNTOS.length);
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
  return notaExcluidas() + `<p class="pista">El veredicto es el de la última revisión entregada de cada equipo.</p>` +
    tabla(["Salón","Equipos","Revisados","Aptos","Con obs.","No aptos","Sin veredicto","Última"], cuerpo);
}

/* ---------- incompletos ---------- */
export function informeIncompletos(){
  const grupos = inf.agruparIncompletos(filasIncompletas(), estado.datos.porId);
  const total = grupos.reduce((n, g) => n + g.filas.length, 0);
  if(!total) return `<p class="vacio-chico">Nada incompleto: todo lo entregado está completo.</p>`;
  return `<div class="filtros no-print">
      <p class="aviso-falta">${ICONO_FALTA} ${total} ${total === 1 ? "equipo incompleto" : "equipos incompletos"},
        agrupados por quien lo debe completar. No van en el informe final.</p>
      <button class="btn ghost chico" id="b-csv-inc">Descargar CSV</button>
    </div>` + grupos.map(g => `
    <section class="grupo-falta">
      <h3>${esc(g.nombre)}<small>${esc(g.grupo)} · ${g.filas.length}</small></h3>
      ${tabla(["Equipo","Fecha","Qué le falta",""], g.filas.map(f => `<tr class="fila-falta">
        <td class="num">${ICONO_FALTA} ${esc(val(f.equipo?.serial, "sin serial"))}<small class="sub-td">${
          esc(`${val(f.equipo?.marca, "")} ${val(f.equipo?.modelo, "")}`.trim())}</small></td>
        <td class="num">${esc(f.hoja?.fecha || "—")}</td>
        <td>${esc(f.falta.join(", "))}</td>
        <td>${f.hoja ? `<button class="btn ghost chico" data-ajena="${esc(f.hoja.id)}">Ver</button>` : ""}</td>
      </tr>`).join(""))}
    </section>`).join("");
}

export function csvIncompletos(){
  const cel = v => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const porId = estado.datos.porId;
  const cuerpo = filasIncompletas().map(f => [
    porId[f.autor_id]?.nombre || porId[f.autor_id]?.usuario || "", porId[f.autor_id]?.grupo || "",
    f.equipo?.serial || "", f.equipo?.marca || "", f.equipo?.modelo || "", f.hoja?.fecha || "", f.falta.join("; ")
  ].map(cel).join(",")).join("\n");
  return "\uFEFF" + ["estudiante","grupo","serial","marca","modelo","fecha","falta"].join(",") + "\n" + cuerpo;
}

/* ---------- inventario ---------- */
export function vistaInventario(){
  const d = estado.datos;
  if(!d) return `<p class="vacio-chico">Cargando…</p>`;
  const filas = inf.inventario(d.equipos, finales(), d.porId);
  const falta = inf.faltaPorEquipo(filasIncompletas());
  if(!filas.length) return `<p class="vacio-chico">El inventario se llena solo: cada serial
    que un estudiante escribe en una hoja entra aquí. Todavía no hay ninguno.</p>`;
  const cuerpo = filas.map(f => `<tr${falta[f.id] ? ` class="fila-falta" title="${esc("Falta: " + falta[f.id].join(", "))}"` : ""}>
    <td class="num">${falta[f.id] ? ICONO_FALTA + " " : ""}${esc(f.serial)}</td>
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
      <p class="pista">${filas.length} equipos, acumulados de lo que los estudiantes han escrito.${
        Object.keys(falta).length ? ` ${ICONO_FALTA} ${Object.keys(falta).length} incompletos: no van en el CSV.` : ""}</p>
      <button class="btn ghost chico" id="b-csv">Descargar CSV</button>
    </div>` +
    tabla(["Serial","Equipo","Inventario","Salón","Revisiones","Último veredicto","Fecha","Técnico"], cuerpo);
}

export function csvInventario(){
  const d = estado.datos;
  const falta = inf.faltaPorEquipo(filasIncompletas());
  const filas = inf.inventario(d.equipos, finales(), d.porId).filter(f => !falta[f.id]);
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
export function pintarPestana(p){
  const caja = $(p === "informes" ? "#cuerpo-informe" : "#cuerpo-" + p);
  if(!caja || !estado.datos) return;
  if(p === "informes"){
    caja.innerHTML =
      estado.informe === "estudiante" ? informePorEstudiante() :
      estado.informe === "grupo"      ? informePorGrupo() :
      estado.informe === "salon"      ? informePorSalon() :
      estado.informe === "incompletos" ? informeIncompletos() : vistaTablaTaller();
    if(estado.informe === "incompletos"){
      enlazarAjenas(caja);
      const b = $("#b-csv-inc");
      if(b) b.onclick = () => descargar("equipos-incompletos.csv", csvIncompletos(), "text/csv");
    }
    if(estado.informe === "todo") montarTablaTaller();
  } else if(p === "inventario"){
    caja.innerHTML = vistaInventario();
    const b = $("#b-csv");
    if(b) b.onclick = () => descargar("inventario-taller.csv", csvInventario(), "text/csv");
  } else if(p === "gente"){
    caja.innerHTML = vistaGente();
    montarGente(caja);
  } else if(p === "revisar"){
    caja.innerHTML = vistaRevisar();
    enlazarAjenas(caja);
    caja.querySelectorAll("[data-unir-eq]").forEach(b =>
      b.onclick = () => unirEquipos(b.dataset.unirEq));
    caja.querySelectorAll("[data-unir-gente]").forEach(b =>
      b.onclick = () => unirEstudiantes(b.dataset.unirGente));
  }
}

export function descargar(nombre, texto, tipo){
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([texto], { type: tipo + ";charset=utf-8" }));
  a.download = nombre;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

/* ---------- revisar: duplicados y hojas sin culminar ---------- */
export function vistaRevisar(){
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
export async function unirEquipos(clave){
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

export async function unirEstudiantes(clave){
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

/* ---------- gente: estudiantes e instructores ---------- */
const clavePropuesta = () => {
  // sin 0/O ni 1/l: se la va a dictar a alguien
  const a = "abcdefghjkmnpqrstuvwxyz23456789";
  return Array.from(crypto.getRandomValues(new Uint8Array(8)), n => a[n % a.length]).join("");
};

async function gestionar(cuerpo){
  const { data, error } = await conCorte(sb.functions.invoke("gestion", { body: cuerpo }));
  let msg = data?.error;
  if(error && !msg){ try { msg = (await error.context.json()).error; } catch(_){ msg = explicar(error); } }
  return msg || null;
}

export function vistaGente(){
  const d = estado.datos;
  if(!d) return `<p class="vacio-chico">Cargando…</p>`;
  const soySuper = estado.perfil.es_superusuario === true;
  const gente = Object.values(d.porId).sort((a, b) =>
    (b.solicita_instructor - a.solicita_instructor) || (a.rol === b.rol ? 0 : a.rol === "instructor" ? -1 : 1) ||
    String(a.nombre || a.usuario).localeCompare(String(b.nombre || b.usuario), "es"));
  const hojas = id => d.diagnosticos.filter(h => h.autor_id === id).length;
  const filas = gente.map(p => {
    const esInst = p.rol === "instructor";
    const puede = !esInst || soySuper;           // un instructor solo gestiona estudiantes
    const botones = (puede && p.id !== estado.perfil.id ? `
        <button class="btn ghost chico" data-g-clave="${esc(p.id)}" data-nombre="${esc(p.nombre || p.usuario)}">Nueva clave</button>
        <button class="btn peligro chico" data-g-borrar="${esc(p.id)}" data-nombre="${esc(p.nombre || p.usuario)}">Borrar</button>` : "") +
      (soySuper && !p.es_superusuario ? `
        <button class="btn ghost chico" data-g-rol="${esc(p.id)}" data-a="${esc(esInst ? "estudiante" : "instructor")}" data-nombre="${esc(p.nombre || p.usuario)}">${
          esInst ? "Quitar instructor" : "Hacer instructor"}</button>` : "");
    return `<tr>
      <td>${esc(p.nombre || p.usuario)}<small class="sub-td">${esc(p.usuario)}</small></td>
      <td>${esc(p.grupo || "—")}</td>
      <td>${esc(p.email || "—")}</td>
      <td>${p.es_superusuario ? "Superusuario" : esInst ? "Instructor" : "Estudiante"}${
        p.solicita_instructor && !esInst ? ' <span class="pill" data-v="obs">Pide ser instructor</span>' : ""}</td>
      <td class="num">${hojas(p.id)}</td>
      <td><div class="fila">${botones}</div></td>
    </tr>`;
  }).join("");
  return `
    <p class="pista">Las contraseñas no se pueden ver (Supabase solo guarda un cifrado). Si alguien la olvida,
      <b>Nueva clave</b> genera una y se la dices en persona.
      ${soySuper ? "Como superusuario también nombras a los instructores." : "Solo el superusuario nombra instructores."}</p>
    <form id="f-nuevo-est" class="campos filtros no-print">
      <label class="f">Usuario<input id="g-usuario" required placeholder="lrivera" autocapitalize="none"></label>
      <label class="f">Clave<input id="g-clave" required minlength="6" value="${esc(clavePropuesta())}"></label>
      <label class="f">Nombre<input id="g-nombre"></label>
      <label class="f">Grupo<input id="g-grupo" value="${esc(estado.perfil.grupo || "")}"></label>
      <label class="f">Correo<input id="g-email" type="email"></label>
      <button class="btn chico" type="submit">Agregar estudiante</button>
    </form>` + tabla(["Nombre","Grupo","Correo","Rol","Hojas",""], filas);
}

export function montarGente(caja){
  const recargar = async msg => { await cargarDatos(); pintarPestana("gente"); if(msg) aviso(msg, "exito"); };
  $("#f-nuevo-est")?.addEventListener("submit", async ev => {
    ev.preventDefault();
    const clave = $("#g-clave").value;
    const msg = await gestionar({ accion: "crear", usuario: $("#g-usuario").value.trim().toLowerCase(),
      password: clave, nombre: $("#g-nombre").value.trim(), grupo: $("#g-grupo").value.trim(),
      email: $("#g-email").value.trim() });
    if(msg){ aviso(msg); return; }
    alert(`Cuenta creada.\nUsuario: ${$("#g-usuario").value.trim().toLowerCase()}\nClave: ${clave}\nAnótala: no se vuelve a mostrar.`);
    await recargar("Estudiante agregado.");
  });
  caja.querySelectorAll("[data-g-clave]").forEach(b => b.onclick = async () => {
    const clave = prompt(`Clave nueva para ${b.dataset.nombre} (mínimo 6 caracteres):`, clavePropuesta());
    if(!clave) return;
    const msg = await gestionar({ accion: "clave", id: b.dataset.gClave, password: clave });
    if(msg){ aviso(msg); return; }
    alert(`Listo. Clave de ${b.dataset.nombre}: ${clave}\nDísela en persona; no se vuelve a mostrar.`);
  });
  caja.querySelectorAll("[data-g-borrar]").forEach(b => b.onclick = async () => {
    const n = estado.datos.diagnosticos.filter(h => h.autor_id === b.dataset.gBorrar).length;
    if(!confirm(`Se borra la cuenta de ${b.dataset.nombre} y sus ${n} hojas. No se deshace. ¿Seguro?`)) return;
    const msg = await gestionar({ accion: "borrar", id: b.dataset.gBorrar });
    if(msg){ aviso(msg); return; }
    await recargar("Cuenta borrada.");
  });
  caja.querySelectorAll("[data-g-rol]").forEach(b => b.onclick = async () => {
    const a = b.dataset.a;
    if(!confirm(a === "instructor" ? `¿Nombrar instructor a ${b.dataset.nombre}? Podrá ver y editar el trabajo de todos.`
                                  : `¿Quitarle el rol de instructor a ${b.dataset.nombre}?`)) return;
    const { error } = await conCorte(sb.from("perfiles").update({ rol: a }).eq("id", b.dataset.gRol));
    if(error){ aviso(explicar(error)); return; }
    await recargar(a === "instructor" ? "Ahora es instructor." : "Ya no es instructor.");
  });
}

export async function recargarInstructor(mensaje){
  await cargarDatos();
  pintar();
  if(mensaje) aviso(mensaje, "exito");
}

/* ================= vista de instructor ================= */
// Lo único que no funciona sin señal: el trabajo de los demás nunca se
// guarda en el equipo del instructor, porque no es suyo.

// Las hojas con el nombre de su autor y su equipo ya pegados, que es como se
// leen en la tabla. Sale de estado.datos y no de una consulta aparte: son las
// mismas filas que ya usan los informes.
export function hojasConTodo(){
  const d = estado.datos;
  if(!d) return [];
  return d.diagnosticos.map(h => {
    const a = d.porId[h.autor_id] || {}, e = d.eqPorId[h.equipo_id] || {};
    return { ...h, falta: h.estado === "entregado" ? inf.faltantes(h, e, PUNTOS.length) : [],
             autor_nombre: a.nombre || "", autor_usuario: a.usuario || "",
             autor_grupo: a.grupo || "", equipo_serial: e.serial || "",
             equipo_marca: e.marca || "", equipo_modelo: e.modelo || "" };
  });
}

export function filasInstructor(filas){
  return filas.map(f => {
    const c = f.conteo || {};
    const falta = f.falta || [];
    return `<tr data-ajena="${esc(f.id)}" tabindex="0" role="button"${
      falta.length ? ` class="fila-falta" title="${esc("Falta: " + falta.join(", "))}"` : ""}>
      <td class="num">${falta.length ? ICONO_FALTA + " " : ""}${esc(f.fecha)}</td>
      <td>${esc(f.autor_nombre || f.autor_usuario)}</td>
      <td>${esc(f.autor_grupo || "—")}</td>
      <td class="num">${esc(f.equipo_serial || "—")}</td>
      <td>${esc(`${f.equipo_marca} ${f.equipo_modelo}`.trim() || "—")}</td>
      <td><span class="pill" data-v="${esc(f.estado === "borrador" ? "" : f.veredicto)}">${
        f.estado === "borrador" ? "Borrador" : esc(VEREDICTOS[f.veredicto] || "—")}</span></td>
      <td class="num">${c.ok || 0}/${c.obs || 0}/${c.falla || 0}</td>
      <td class="num">${f.nota == null ? "—" : esc(f.nota)}</td>
    </tr>`;
  }).join("");
}

export function vistaInstructor(){
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
      <button type="button" id="p-gente" aria-pressed="false">Gente</button>
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
           ["salon","Por salón"],["incompletos","! Incompletos"],["todo","Todas las hojas"]]
          .map(([k, t]) => `<button type="button" data-informe="${k}" aria-pressed="${
            estado.informe === k}">${t}</button>`).join("")}
      </div>
      <div id="cuerpo-informe"></div>
    </div>

    <div id="panel-inventario" hidden><div id="cuerpo-inventario"></div></div>
    <div id="panel-revisar" hidden><div id="cuerpo-revisar"></div></div>
    <div id="panel-gente" hidden><div id="cuerpo-gente"></div></div>
  </div>`;
}

// La tabla de siempre: sirve para buscar por serial o mirar otras fechas,
// que es justo lo que el tablero del día no hace.
export function vistaTablaTaller(){
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
        <th>Equipo</th><th>Veredicto</th><th>B/O/F</th><th>Nota</th>
      </tr></thead><tbody id="tb">${cuerpo}</tbody></table>
    </div>`;
}

export function montarInstructor(){
  $("#b-volver").onclick = () => {
    clearInterval(estado.latido); estado.latido = null;
    estado.vista = "panel"; pintar();
  };

  /* ---- pestañas ---- */
  const PESTANAS = ["hoy","informes","inventario","revisar","gente"];
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
export function montarTablaTaller(){
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
