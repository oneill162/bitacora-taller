import { PUNTOS, VEREDICTOS } from "./protocolo.js";
import * as inf from "./informes.js";
import { sb, $, app, estado, esc, hoy, fechaLarga, val, aviso, explicar, esDeRed, conCorte, servidor, conectado } from "./nucleo.js";
import { pintar } from "./router.js";
import { cargarTaller, filasTaller, resumenTaller, mosaicoDia, enlazarAjenas, pintarTaller } from "./tablero.js";
import { RECINTOS, chipEstado, glifo, prepararEntradas, ajustarTitulares, cambiarRecinto, avisar, ilustracion, placaHero } from "./campus.js";
import * as local from "./local.js";

/* ================= informes, inventario y duplicados ================= */
// Una sola bajada para las tres pestañas: son las mismas tablas cruzadas de
// distintas maneras, y pedirlas por separado tres veces no ayuda a nadie.
export async function cargarDatos(){
  if(!conectado()){
    aviso("Los informes necesitan conexión: el trabajo de los demás no se guarda en tu equipo.");
    return false;
  }
  const columnas = "id, usuario, nombre, grupo, escuela, rol, email, solicita_instructor, es_superusuario";
  const pedirGente = cols => conCorte(sb.from("perfiles").select(cols));
  let [{ data: gente, error: e1 }, { data: eqs, error: e2 }, { data: hojas, error: e3 }] =
    await Promise.all([
      pedirGente(columnas + ", recinto"),
      conCorte(sb.from("equipos").select("*")),
      conCorte(sb.from("diagnosticos")
        .select("id, autor_id, equipo_id, orden, fecha, estado, veredicto, conteo, sistema, hallazgos, actualizado_en, nota")
        .order("fecha", { ascending:false }).limit(2000))
    ]);
  // Mientras la columna "recinto" no exista en Supabase, los informes siguen funcionando sin ella.
  if(e1 && /recinto/i.test(e1.message || "")){ ({ data: gente, error: e1 } = await pedirGente(columnas)); }
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
// hablar con alguien. Las series se distinguen por relleno (sólido y rayas) y
// no solo por color, la cifra va escrita al final de cada barra y la tabla de
// abajo repite todos los valores. El extremo de cada tramo está cortado a 30°.
export function graficaTrabajo(filas){
  const conAlgo = filas.filter(f => f.hojas > 0);
  if(!conAlgo.length) return `<p class="vacio-t">Todavía no hay trabajo que graficar.</p>`;
  const tope = Math.max(...filas.map(f => f.hojas));
  const notas = filas.map(f => f.promedio).filter(n => typeof n === "number");
  const media = notas.length ? Math.round(notas.reduce((a, b) => a + b, 0) / notas.length) : null;

  const barras = filas.map((f, i) => {
    const pct = n => tope ? (n / tope) * 100 : 0;
    const t = `${f.nombre}: ${f.entregadas} entregada${f.entregadas === 1 ? "" : "s"}, ` +
              `${f.borradores} sin entregar`;
    return `
    <div class="gt-f"${f.hojas === 0 ? ' data-cero="1"' : ""}>
      <span class="gt-n" title="${esc(f.nombre)}">${esc(f.nombre)}</span>
      <span class="gt-b" role="img" aria-label="${esc(t)}">
        ${f.entregadas ? `<i class="s1 barra-g" style="width:${pct(f.entregadas)}%;--i:${Math.min(i, 8)}"></i>` : ""}
        ${f.borradores ? `<i class="s2 barra-g" style="width:${pct(f.borradores)}%;--i:${Math.min(i, 8)}"></i>` : ""}
      </span>
      <b class="gt-v">${f.hojas || "0"}</b>
    </div>`;
  }).join("");

  return `
  <figure class="gt rev">
    <figcaption>
      <h3 class="h3">Trabajo acumulado por estudiante</h3>
      <p class="pista">Hojas de diagnóstico, de más a menos.${
        media == null ? "" : ` Nota media de los calificados: <b>${media}</b>.`}</p>
    </figcaption>
    <ul class="gt-ley" aria-label="Qué significa cada relleno">
      <li><i class="s1" aria-hidden="true"></i>Entregadas</li>
      <li><i class="s2" aria-hidden="true"></i>Sin entregar</li>
    </ul>
    <div class="gt-cuerpo">${barras}</div>
  </figure>`;
}

/* ---------- tablas de cada informe ---------- */
// Una tabla que pasa a tarjetas con etiqueta bajo ~900px de app: cada <td> lleva data-l.
// Un encabezado es un texto, o { t, n: true (cifra, a la derecha), sr: true (solo para lectores) }.
export const tabla = (encabezados, filas, { caption = "", clase = "" } = {}) => `
  <div class="tabla-env rev">
    <table class="datos apila ${clase}">
      <caption class="sr">${esc(caption || "Datos")}</caption>
      <thead><tr>${encabezados.map(h => {
        const o = typeof h === "string" ? { t: h } : h;
        return `<th scope="col"${o.n ? ' class="n"' : ""}>${o.sr ? `<span class="sr">${esc(o.t)}</span>` : esc(o.t)}</th>`;
      }).join("")}</tr></thead>
      <tbody>${filas}</tbody>
    </table>
  </div>`;

const cifra = (l, v, cls = "") => `<td class="n${cls ? " " + cls : ""}" data-l="${esc(l)}">${v}</td>`;
const vacioT = t => `<p class="vacio-t">${t}</p>`;

export function informePorEstudiante(){
  const d = estado.datos;
  // Igual que por grupo y por salón: las sumas son de lo que entra al informe final. "Sin culminar" cuenta las que se quedaron fuera.
  const incompletas = Object.fromEntries(inf.porEstudiante(d.estudiantes, d.diagnosticos, PUNTOS.length, d.eqPorId).map(f => [f.id, f.incompletas]));
  const filas = inf.porEstudiante(d.estudiantes, finales(), PUNTOS.length, d.eqPorId).map(f => ({ ...f, incompletas: incompletas[f.id] || 0 }));
  const cuerpo = filas.map(f => `<tr>
    <td class="primera"><b>${esc(f.nombre)}</b><small>${esc(f.usuario)}${f.grupo ? " · " + esc(f.grupo) : ""}</small></td>
    ${cifra("Hojas", f.hojas)}
    ${cifra("Entregadas", f.entregadas)}
    ${cifra("Sin entregar", f.borradores)}
    ${cifra("Puntos evaluados", f.puntos, "sec")}
    ${cifra("Fallas halladas", f.fallas)}
    ${cifra("Sin culminar", f.incompletas ? chipEstado("inc", String(f.incompletas)) : "—")}
    ${cifra("Nota media", f.promedio == null ? "—" : f.promedio)}
    ${cifra("Última", esc(f.ultima || "—"))}
  </tr>`).join("");
  return notaExcluidas() + graficaTrabajo(filas) +
    tabla(["Estudiante", { t:"Hojas", n:1 }, { t:"Entregadas", n:1 }, { t:"Sin entregar", n:1 }, { t:"Puntos evaluados", n:1 },
           { t:"Fallas halladas", n:1 }, { t:"Sin culminar", n:1 }, { t:"Nota media", n:1 }, { t:"Última", n:1 }], cuerpo,
          { caption: "Informe por estudiante", clase: "t-est" });
}

// Lo que entra al informe final: sin las hojas entregadas a medias.
const finales = () => inf.soloFinales(estado.datos.diagnosticos, estado.datos.eqPorId, PUNTOS.length);
const filasIncompletas = () => inf.incompletos(estado.datos.equipos, estado.datos.diagnosticos, PUNTOS.length);

function notaExcluidas(){
  const n = estado.datos.diagnosticos.length - finales().length;
  return n ? `<p class="aviso-inc">${glifo("inc")}<span>${n} ${n === 1 ? "hoja incompleta no está incluida" : "hojas incompletas no están incluidas"}
    en este informe. Mira el informe <b>Incompletos</b>.</span></p>` : "";
}

export function informePorGrupo(){
  const d = estado.datos;
  const filas = inf.porGrupo(d.estudiantes, finales(), PUNTOS.length);
  const cuerpo = filas.map(f => `<tr>
    <td class="primera"><b>${esc(f.grupo)}</b></td>
    ${cifra("Han trabajado", `${f.activos} de ${f.estudiantes}`)}
    ${cifra("Hojas", f.hojas)}
    ${cifra("Entregadas", f.entregadas)}
    ${cifra("Puntos evaluados", f.puntos, "sec")}
    ${cifra("Fallas", f.fallas)}
    ${cifra("Equipos no aptos", f.noAptos)}
    ${cifra("Última", esc(f.ultima || "—"), "sec")}
  </tr>`).join("");
  return notaExcluidas() + tabla(["Grupo", { t:"Han trabajado", n:1 }, { t:"Hojas", n:1 }, { t:"Entregadas", n:1 },
    { t:"Puntos evaluados", n:1 }, { t:"Fallas", n:1 }, { t:"Equipos no aptos", n:1 }, { t:"Última", n:1 }], cuerpo,
    { caption: "Informe por grupo" });
}

export function informePorSalon(){
  const d = estado.datos;
  const filas = inf.porSalon(d.equipos, finales(), PUNTOS.length);
  if(!filas.length) return vacioT("Todavía no hay equipos registrados.");
  const cuerpo = filas.map(f => `<tr>
    <td class="primera"><b>${esc(f.salon)}</b></td>
    ${cifra("Equipos", f.equipos)}
    ${cifra("Revisados", f.diagnosticados)}
    ${cifra("Aptos", f.equiposAptos ? chipEstado("apto", String(f.equiposAptos)) : "—")}
    ${cifra("Con obs.", f.equiposConObs ? chipEstado("obs", String(f.equiposConObs)) : "—")}
    ${cifra("No aptos", f.equiposNoAptos ? chipEstado("no", String(f.equiposNoAptos)) : "—")}
    ${cifra("Sin veredicto", f.equiposSinVeredicto || "—")}
    ${cifra("Última", esc(f.ultima || "—"), "sec")}
  </tr>`).join("");
  return notaExcluidas() + `<p class="pista">El veredicto es el de la última revisión entregada de cada equipo.</p>` +
    tabla(["Salón", { t:"Equipos", n:1 }, { t:"Revisados", n:1 }, { t:"Aptos", n:1 }, { t:"Con obs.", n:1 },
           { t:"No aptos", n:1 }, { t:"Sin veredicto", n:1 }, { t:"Última", n:1 }], cuerpo,
          { caption: "Informe por salón" });
}

/* ---------- incompletos ---------- */
export function informeIncompletos(){
  const grupos = inf.agruparIncompletos(filasIncompletas(), estado.datos.porId);
  const total = grupos.reduce((n, g) => n + g.filas.length, 0);
  if(!total) return vacioT("Nada incompleto: todo lo entregado está completo.");
  return `<div class="filtros-t no-print">
      <p class="aviso-inc">${glifo("inc")}<span>${total} ${total === 1 ? "equipo incompleto" : "equipos incompletos"},
        agrupados por quien lo debe completar. No van en el informe final.</span></p>
      <button type="button" class="btn tenue chico" id="b-csv-inc">Descargar CSV</button>
    </div>` + grupos.map(g => `
    <section class="grupo-falta">
      <h3 class="h3">${esc(g.nombre)}<small>${esc(g.grupo)} · ${g.filas.length}</small></h3>
      ${tabla(["Equipo", { t:"Fecha", n:1 }, "Qué le falta", { t:"Ver la hoja", sr:1 }], g.filas.map(f => `<tr data-v="inc">
        <td class="primera"><b>${esc(val(f.equipo?.serial, "sin serial"))}</b><small>${
          esc(`${val(f.equipo?.marca, "")} ${val(f.equipo?.modelo, "")}`.trim() || "Sin marca ni modelo")}</small></td>
        ${cifra("Fecha", esc(f.hoja?.fecha || "—"))}
        <td class="v-celda">${chipEstado("inc")} <span class="falta-t">${esc(f.falta.join(", "))}</span></td>
        <td class="t-acc">${f.hoja ? `<button type="button" class="btn tenue chico" data-ajena="${esc(f.hoja.id)}">Ver<span class="sr"> la hoja de ${esc(val(f.equipo?.serial, "este equipo"))}</span></button>` : ""}</td>
      </tr>`).join(""), { caption: `Equipos incompletos de ${g.nombre}` })}
    </section>`).join("");
}

export function csvIncompletos(){
  const cel = v => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const porId = estado.datos.porId;
  const cuerpo = filasIncompletas().map(f => [
    porId[f.autor_id]?.nombre || porId[f.autor_id]?.usuario || "", porId[f.autor_id]?.grupo || "",
    f.equipo?.serial || "", f.equipo?.marca || "", f.equipo?.modelo || "", f.hoja?.fecha || "", f.falta.join("; ")
  ].map(cel).join(",")).join("\n");
  return "﻿" + ["estudiante","grupo","serial","marca","modelo","fecha","falta"].join(",") + "\n" + cuerpo;
}

/* ---------- inventario ---------- */
export function vistaInventario(){
  const d = estado.datos;
  if(!d) return vacioT("Cargando…");
  const filas = inf.inventario(d.equipos, finales(), d.porId);
  const falta = inf.faltaPorEquipo(filasIncompletas());
  if(!filas.length) return vacioT(`El inventario se llena solo: cada serial
    que un estudiante escribe en una hoja entra aquí. Todavía no hay ninguno.`);
  const cuerpo = filas.map(f => `<tr${falta[f.id] ? ` data-v="inc"` : ""}>
    <td class="primera"><b>${esc(f.serial)}</b><small>${esc(`${f.marca} ${f.modelo}`.trim() || "—")}${f.tipo ? " · " + esc(f.tipo) : ""}</small></td>
    <td data-l="Inventario">${esc(f.inventario || "—")}</td>
    <td data-l="Salón">${esc(f.ubicacion || "—")}</td>
    ${cifra("Revisiones", f.revisiones)}
    <td class="v-celda">${falta[f.id] ? chipEstado("inc") + " " : ""}${f.ultimoVeredicto
      ? chipEstado(f.ultimoVeredicto, VEREDICTOS[f.ultimoVeredicto])
      : chipEstado("bor", "Sin entregar")}${falta[f.id] ? `<small>Falta ${esc(falta[f.id].join(", "))}</small>` : ""}</td>
    ${cifra("Fecha", esc(f.ultimaFecha || "—"))}
    <td class="sec" data-l="Técnico">${esc(f.ultimoTecnico || "—")}</td>
  </tr>`).join("");
  return `
    <div class="filtros-t no-print">
      <p class="pista">${filas.length} equipos, acumulados de lo que los estudiantes han escrito.${
        Object.keys(falta).length ? ` ${Object.keys(falta).length} incompletos: no van en el CSV.` : ""}</p>
      <button type="button" class="btn tenue chico" id="b-csv">Descargar CSV</button>
    </div>` +
    tabla(["Equipo", "Inventario", "Salón", { t:"Revisiones", n:1 }, "Último veredicto", { t:"Fecha", n:1 }, "Técnico"], cuerpo,
          { caption: "Inventario de equipos" });
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
  return "﻿" + cab.join(",") + "\n" + cuerpo;
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
  prepararEntradas(caja);        // lo que llegó con datos entra una vez (barras, tablas)
}

export function descargar(nombre, texto, tipo){
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([texto], { type: tipo + ";charset=utf-8" }));
  a.download = nombre;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

/* ---------- revisar: duplicados y hojas sin culminar ---------- */
const chipHoja = h => h.estado === "borrador" ? chipEstado("bor")
  : VEREDICTOS[h.veredicto] ? chipEstado(h.veredicto, VEREDICTOS[h.veredicto]) : `<span class="estado">Sin veredicto</span>`;
const seQueda = `<span class="chip">Se queda</span>`;

export function vistaRevisar(){
  const d = estado.datos;
  if(!d) return vacioT("Cargando…");
  const dup = inf.duplicados(d.equipos, d.diagnosticos, d.estudiantes, d.porId);
  const incompletas = d.diagnosticos
    .filter(x => x.estado === "entregado")
    .map(x => ({ hoja: x, falta: inf.faltantes(x, d.eqPorId[x.equipo_id], PUNTOS.length) }))
    .filter(x => x.falta.length);

  const nada = vacioT("Nada que revisar por aquí.");

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
          ${i === gana ? seQueda : ""}
        </li>`).join("")}</ul>
      <button type="button" class="btn tenue chico" data-unir-eq="${esc(g.clave)}">
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
          ${chipHoja(h)}
          <button type="button" class="btn tenue chico" data-ajena="${esc(h.id)}">Ver<span class="sr"> la hoja ${esc(val(h.orden, ""))}</span></button></li>`).join("")}</ul>
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
          ${i === gana ? seQueda : ""}</li>`).join("")}</ul>
      ${g.hojas.filter((_, i) => i !== gana).some(n => n > 0)
        ? `<button type="button" class="btn tenue chico" data-unir-gente="${esc(g.clave)}">
            Pasar todo a <code>${esc(g.estudiantes[gana].usuario)}</code></button>`
        : `<p class="pista">El trabajo ya está todo en una cuenta. Las demás siguen
            existiendo vacías: bórralas en Authentication → Users del panel de Supabase.</p>`}
    </div>`;
  }).join("") : nada;

  const secFalta = incompletas.length ? `
    <p class="pista">Entregadas pero sin culminar. No se bloquea nada: es para que decidas.</p>` +
    tabla(["Hoja", "Estudiante", { t:"Fecha", n:1 }, "Qué le falta", { t:"Ver la hoja", sr:1 }], incompletas.map(x => `<tr data-v="inc">
      <td class="primera"><b>${esc(val(x.hoja.orden, "Sin orden"))}</b></td>
      <td data-l="Estudiante">${esc(estado.datos.porId[x.hoja.autor_id]?.nombre || "?")}</td>
      ${cifra("Fecha", esc(x.hoja.fecha))}
      <td class="v-celda">${chipEstado("inc")} <span class="falta-t">${esc(x.falta.join(", "))}</span></td>
      <td class="t-acc"><button type="button" class="btn tenue chico" data-ajena="${esc(x.hoja.id)}">Ver<span class="sr"> la hoja ${esc(val(x.hoja.orden, ""))}</span></button></td>
    </tr>`).join(""), { caption: "Hojas entregadas sin culminar" }) : nada;

  const n = inf.hayDuplicados(dup) + incompletas.length;
  return `
    <p class="pista no-print">${n
      ? `${n} ${n === 1 ? "cosa" : "cosas"} por revisar.`
      : "Nada pendiente: sin duplicados y sin hojas a medias."}</p>
    <h3 class="h3 rev-t">Hojas entregadas sin culminar</h3>${secFalta}
    <h3 class="h3 rev-t">La misma máquina con el serial escrito distinto</h3>${secSerial}
    <h3 class="h3 rev-t">El mismo equipo revisado dos veces el mismo día</h3>${secHojas}
    <h3 class="h3 rev-t">Números de inventario repetidos</h3>${secInv}
    <h3 class="h3 rev-t">Estudiantes con más de una cuenta</h3>${secGente}`;
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

const opcionesRecinto = actual => `<option value=""${actual ? "" : " selected"}>Sin elegir</option>` +
  Object.values(RECINTOS).map(r => `<option value="${r.id}"${r.id === actual ? " selected" : ""}>${esc(r.nombre)}</option>`).join("");

export function vistaGente(){
  const d = estado.datos;
  if(!d) return vacioT("Cargando…");
  const soySuper = estado.perfil.es_superusuario === true;
  const gente = Object.values(d.porId).sort((a, b) =>
    (b.solicita_instructor - a.solicita_instructor) || (a.rol === b.rol ? 0 : a.rol === "instructor" ? -1 : 1) ||
    String(a.nombre || a.usuario).localeCompare(String(b.nombre || b.usuario), "es"));
  const hojas = id => d.diagnosticos.filter(h => h.autor_id === id).length;
  const filas = gente.map(p => {
    const esInst = p.rol === "instructor";
    const puede = !esInst || soySuper;           // un instructor solo gestiona estudiantes
    const nombre = p.nombre || p.usuario;
    const botones = (puede && p.id !== estado.perfil.id ? `
        <button type="button" class="btn tenue chico" data-g-clave="${esc(p.id)}" data-nombre="${esc(nombre)}">Nueva clave<span class="sr"> de ${esc(nombre)}</span></button>
        <button type="button" class="btn peligro chico" data-g-borrar="${esc(p.id)}" data-nombre="${esc(nombre)}">Borrar<span class="sr"> a ${esc(nombre)}</span></button>` : "") +
      (soySuper && !p.es_superusuario ? `
        <button type="button" class="btn tenue chico" data-g-rol="${esc(p.id)}" data-a="${esc(esInst ? "estudiante" : "instructor")}" data-nombre="${esc(nombre)}">${
          esInst ? "Quitar instructor" : "Hacer instructor"}<span class="sr"> a ${esc(nombre)}</span></button>` : "");
    // el recinto de cada persona (perfiles.recinto): el instructor lo cambia a sus estudiantes y a sí mismo
    const recinto = puede || p.id === estado.perfil.id
      ? `<select class="sel-rec" data-g-recinto="${esc(p.id)}" data-nombre="${esc(nombre)}" aria-label="${esc("Recinto de " + nombre)}">${opcionesRecinto(p.recinto)}</select>`
      : esc(RECINTOS[p.recinto]?.nombre || "Sin elegir");
    return `<tr>
      <td class="primera"><b>${esc(nombre)}</b><small>${esc(p.usuario)}</small></td>
      <td data-l="Grupo">${esc(p.grupo || "—")}</td>
      <td class="t-correo" data-l="Correo">${esc(p.email || "—")}</td>
      <td class="t-rol" data-l="Rol"><span class="chip rol">${p.es_superusuario ? "Superusuario" : esInst ? "Instructor" : "Estudiante"}</span>${
        p.solicita_instructor && !esInst ? ` <span class="chip">${glifo("info")}Pide ser instructor</span>` : ""}</td>
      <td class="t-recinto" data-l="Recinto">${recinto}</td>
      ${cifra("Hojas", hojas(p.id))}
      <td class="t-acc"><div class="fila">${botones}</div></td>
    </tr>`;
  }).join("");
  return `
    <p class="pista">Las contraseñas no se pueden ver (Supabase solo guarda un cifrado). Si alguien la olvida,
      <b>Nueva clave</b> genera una y se la dices en persona.
      ${soySuper ? "Como superusuario también nombras a los instructores." : "Solo el superusuario nombra instructores."}</p>
    <form id="f-nuevo-est" class="form-nuevo no-print">
      <h3 class="h3">Agregar un estudiante</h3>
      <div class="form-rej">
        <label class="campo-f">Usuario<input id="g-usuario" required placeholder="lrivera" autocapitalize="none"></label>
        <label class="campo-f">Clave<input id="g-clave" required minlength="6" value="${esc(clavePropuesta())}"></label>
        <label class="campo-f">Nombre<input id="g-nombre"></label>
        <label class="campo-f">Grupo<input id="g-grupo" value="${esc(estado.perfil.grupo || "")}"></label>
        <label class="campo-f">Correo<input id="g-email" type="email"></label>
        <label class="campo-f">Recinto<select id="g-recinto">${opcionesRecinto(estado.perfil.recinto)}</select></label>
        <button class="btn" type="submit">Agregar estudiante</button>
      </div>
    </form>` + tabla(["Nombre", "Grupo", "Correo", "Rol", "Recinto", { t:"Hojas", n:1 }, { t:"Acciones", sr:1 }], filas,
      { caption: "Estudiantes e instructores", clase: "t-gente" });
}

export function montarGente(caja){
  const recargar = async msg => { await cargarDatos(); pintarPestana("gente"); if(msg) aviso(msg, "exito"); };
  $("#f-nuevo-est")?.addEventListener("submit", async ev => {
    ev.preventDefault();
    const clave = $("#g-clave").value;
    const msg = await gestionar({ accion: "crear", usuario: $("#g-usuario").value.trim().toLowerCase(),
      password: clave, nombre: $("#g-nombre").value.trim(), grupo: $("#g-grupo").value.trim(),
      email: $("#g-email").value.trim(), recinto: $("#g-recinto").value });
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
  // el recinto de la persona: perfiles.recinto (vacío = sin elegir; que el equipo guarde el suyo)
  caja.querySelectorAll("[data-g-recinto]").forEach(s => s.onchange = async () => {
    const id = s.dataset.gRecinto, p = estado.datos.porId[id], nuevo = s.value;   // "" = sin elegir: la columna es text not null
    const { error } = await conCorte(sb.from("perfiles").update({ recinto: nuevo }).eq("id", id));
    if(error){
      s.value = p?.recinto || "";
      aviso(columnaFalta(error)
        ? "Falta la columna «recinto» en perfiles: pídele al administrador de Supabase que la agregue."
        : explicar(error));
      return;
    }
    if(p) p.recinto = nuevo;
    if(id === estado.perfil.id){
      estado.perfil.recinto = nuevo;
      await local.guardarMeta("perfil", estado.perfil);   // la copia del equipo también: al abrir sin señal manda esa
      if(nuevo) cambiarRecinto(nuevo, s);
    }
    // el aviso flotante: está donde el instructor tiene la vista, no arriba de una tabla larga
    avisar(nuevo ? `${s.dataset.nombre} ahora es del recinto de ${RECINTOS[nuevo].nombre}.` : `${s.dataset.nombre} quedó sin recinto.`);
  });
}

// Solo el error de PostgREST/Postgres por una columna que no existe; un "recinto" suelto en otro mensaje no cuenta.
const columnaFalta = e => e.code === "PGRST204" || e.code === "42703" || /could not find the 'recinto' column|column .*recinto.* does not exist/i.test(e.message || "");

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
  if(!filas.length) return `<tr><td colspan="7" class="vacio-celda">Ninguna hoja coincide con esos filtros.</td></tr>`;
  return filas.map(f => {
    const c = f.conteo || {};
    const falta = f.falta || [];
    const v = falta.length ? "inc" : f.estado === "borrador" ? "bor" : (f.veredicto || "");
    return `<tr data-ajena="${esc(f.id)}" tabindex="0" role="button" data-v="${esc(v)}"${
      falta.length ? ` title="${esc("Falta: " + falta.join(", "))}"` : ""}>
      <td class="primera"><b>${esc(f.equipo_serial || "Sin serial")}</b><small>${
        esc(`${f.equipo_marca} ${f.equipo_modelo}`.trim() || "—")}</small></td>
      <td data-l="Estudiante">${esc(f.autor_nombre || f.autor_usuario)}</td>
      <td class="sec" data-l="Grupo">${esc(f.autor_grupo || "—")}</td>
      ${cifra("Fecha", esc(f.fecha))}
      <td class="v-celda">${falta.length ? chipEstado("inc") + " " : ""}${chipHoja(f)}</td>
      ${cifra("Bien / obs. / fallas", `${c.ok || 0}/${c.obs || 0}/${c.falla || 0}`)}
      ${cifra("Nota", f.nota == null ? "—" : esc(f.nota))}
    </tr>`;
  }).join("");
}

// El título del héroe y la nota de debajo siguen a la pestaña abierta.
const TITULOS = {
  hoy:        ["El día",     ""],
  informes:   ["Informes",   "Todo lo entregado, de cuatro maneras."],
  inventario: ["Inventario", "Los equipos que los estudiantes han revisado."],
  revisar:    ["Revisar",    "Duplicados y hojas a medias, para que decidas."],
  gente:      ["Gente",      "Estudiantes e instructores, sus claves y su recinto."]
};

export function vistaInstructor(){
  const t = estado.taller || { fecha: hoy(), grupo: "", estudiantes: [], hojas: [] };
  const esHoy = t.fecha === hoy();
  const grupos = [...new Set(t.estudiantes.map(e => e.grupo).filter(Boolean))].sort();
  const chip = (k, txt) => `<button type="button" data-f="${k}" aria-pressed="${(t.filtro || "todo") === k}">${txt}</button>`;
  const pestana = estado.pestana in TITULOS ? estado.pestana : "hoy";
  const informes = [["estudiante","Por estudiante"],["grupo","Por grupo"],
                    ["salon","Por salón"],["incompletos","Incompletos"],["todo","Todas las hojas"]];

  return `
  <section class="cap hero campo hero-chico tab-hero sin-placa-tel no-print" aria-labelledby="h-taller">
    ${ilustracion()}
    <div class="in hero-in">
      <div class="hero-txt">
        <h1 class="h1" id="h-taller"><span class="linea"><span id="tit-pestana">${TITULOS[pestana][0]}</span></span></h1>
        <p class="hero-sub rev" id="sub-pestana">${pestana === "hoy" ? subDia(t, esHoy) : esc(TITULOS[pestana][1])}</p>
        <div class="hero-acc rev no-print"><button type="button" class="btn sec" id="b-volver">Mis diagnósticos</button></div>
      </div>
    </div>
    ${placaHero()}
  </section>

  <section class="cap tab-barra no-print" aria-label="Qué mirar en el taller">
    <div class="in">
      <div class="pestanas rev" role="group" aria-label="Qué mirar">
        <button type="button" id="p-hoy" aria-pressed="true">El día</button>
        <button type="button" id="p-informes" aria-pressed="false">Informes</button>
        <button type="button" id="p-inventario" aria-pressed="false">Inventario</button>
        <button type="button" id="p-revisar" aria-pressed="false">Revisar</button>
        <button type="button" id="p-gente" aria-pressed="false">Gente</button>
      </div>
      <div id="aviso" hidden role="status"></div>
    </div>
  </section>

  <div id="panel-hoy">
    <section class="cap resumen-dia" id="resumen-dia" aria-label="Resumen del día">${mosaicoDia()}</section>
    <section class="cap dia-sec" aria-labelledby="h-fil">
      <div class="in dia-rej">
        <div class="dia-izq">
          <h2 class="h2 rev" id="h-fil">Quién va por dónde</h2>
          <div class="filtros-t no-print rev">
            <label class="campo-f">Día<input type="date" id="ta-fecha" value="${esc(t.fecha)}"></label>
            <label class="campo-f">Grupo<select id="ta-grupo"><option value="">Todos</option>${
              grupos.map(g => `<option${t.grupo === g ? " selected" : ""}>${esc(g)}</option>`).join("")}</select></label>
            <button type="button" class="btn tenue chico" id="ta-hoy"${esHoy ? " disabled" : ""}>Hoy</button>
            <button type="button" class="btn tenue chico" id="ta-refrescar">Actualizar</button>
          </div>
          <div class="pestanas no-print rev" id="filtros-dia" role="group" aria-label="Filtrar el tablero">
            ${chip("todo", "Todos")}${chip("ent", "Entregadas")}${chip("inc", "Incompletas")}${chip("bor", "En progreso")}${chip("sin", "Sin empezar")}
          </div>
          <div class="tablero" id="taller-cuerpo">${filasTaller()}</div>
        </div>
        <aside class="lectura rev" aria-labelledby="h-lect">
          <h3 class="h3" id="h-lect">Cómo leer cada fila</h3>
          <ul>
            <li data-v="apto">${chipEstado("apto")}<span>Todos los puntos bien. Barra fina y continua.</span></li>
            <li data-v="obs">${chipEstado("obs")}<span>Hay detalles por revisar. Barra gruesa y rayada.</span></li>
            <li data-v="no">${chipEstado("no")}<span>Al menos una falla. Barra gruesa y sólida.</span></li>
            <li data-v="inc">${chipEstado("inc")}<span>Entregada con datos sin llenar. Barra segmentada y fondo rosado: no entra al informe final.</span></li>
            <li data-v="bor">${chipEstado("bor")}<span>Sigue en la hoja. Sin barra: dice cuándo la tocó por última vez.</span></li>
          </ul>
        </aside>
      </div>
    </section>
  </div>

  <div id="panel-informes" hidden>
    <section class="cap campo-s2 t-sec" aria-labelledby="h-inf">
      <div class="in">
        <div class="t-cab">
          <div><h2 class="h2 rev" id="h-inf">El trabajo del taller</h2><p class="rev">Escoge cómo quieres mirarlo.</p></div>
          <div class="pestanas no-print rev" role="group" aria-label="Qué informe">
            ${informes.map(([k, x]) => `<button type="button" data-informe="${k}" aria-pressed="${estado.informe === k}">${k === "incompletos" ? glifo("inc") : ""}${x}</button>`).join("")}
          </div>
        </div>
        <div id="cuerpo-informe"></div>
      </div>
    </section>
  </div>

  <div id="panel-inventario" hidden>
    <section class="cap campo-s2 t-sec" aria-labelledby="h-inv"><div class="in">
      <div class="t-cab"><div><h2 class="h2 rev" id="h-inv">Equipos revisados</h2></div></div>
      <div id="cuerpo-inventario"></div>
    </div></section>
  </div>
  <div id="panel-revisar" hidden>
    <section class="cap campo-s2 t-sec" aria-labelledby="h-rev"><div class="in">
      <div class="t-cab"><div><h2 class="h2 rev" id="h-rev">Qué conviene arreglar</h2></div></div>
      <div id="cuerpo-revisar"></div>
    </div></section>
  </div>
  <div id="panel-gente" hidden>
    <section class="cap campo-s2 t-sec" aria-labelledby="h-gen"><div class="in">
      <div class="t-cab"><div><h2 class="h2 rev" id="h-gen">Estudiantes e instructores</h2></div></div>
      <div id="cuerpo-gente"></div>
    </div></section>
  </div>`;
}

const subDia = (t, esHoy) =>
  `${esc(esHoy ? "Hoy, " + fechaLarga(t.fecha) : fechaLarga(t.fecha))}${t.grupo ? " · " + esc(t.grupo) : ""}` +
  `<span class="sub-res"> · <span id="taller-resumen">${esc(resumenTaller())}</span></span>`;

// La tabla de siempre: sirve para buscar por serial o mirar otras fechas,
// que es justo lo que el tablero del día no hace.
export function vistaTablaTaller(){
  const filas = hojasConTodo();
  const grupos = [...new Set(filas.map(f => f.autor_grupo).filter(Boolean))].sort();
  const cuerpo = filasInstructor(filas);

  return `
    <p class="pista">${filas.length} diagnósticos registrados</p>
    <div class="filtros-t no-print">
      <label class="campo-f">Grupo<select id="fi-grupo"><option value="">Todos</option>${
        grupos.map(g => `<option>${esc(g)}</option>`).join("")}</select></label>
      <label class="campo-f">Veredicto<select id="fi-vered">
        <option value="">Todos</option><option value="apto">Apto</option>
        <option value="obs">Con observaciones</option><option value="no">No apto</option></select></label>
      <label class="campo-f">Estado<select id="fi-estado">
        <option value="">Todos</option><option value="entregado">Entregado</option>
        <option value="borrador">Borrador</option></select></label>
      <label class="campo-f">Buscar<input id="fi-texto" placeholder="serial, nombre…"></label>
    </div>
    <div class="tabla-env rev">
      <table class="datos apila t-todas">
        <caption class="sr">Todas las hojas de diagnóstico</caption>
        <thead><tr>
          <th scope="col">Equipo</th><th scope="col">Estudiante</th><th scope="col">Grupo</th><th scope="col" class="n">Fecha</th>
          <th scope="col">Veredicto</th><th scope="col" class="n">B/O/F</th><th scope="col" class="n">Nota</th>
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
    // el héroe dice dónde estás
    const tit = $("#tit-pestana"), sub = $("#sub-pestana");
    if(tit && TITULOS[p]){
      tit.textContent = TITULOS[p][0];
      if(sub) sub.innerHTML = p === "hoy" ? subDia(estado.taller, estado.taller.fecha === hoy()) : esc(TITULOS[p][1]);
      ajustarTitulares($("#h-taller")?.parentElement);
      if(p === "hoy") pintarTaller();
    }
    aviso("");
    if(p !== "hoy"){
      // los informes cruzan todo el taller: se baja una vez y sirve a las tres
      if(!estado.datos){
        const caja = $("#cuerpo-" + (p === "informes" ? "informe" : p));
        if(caja) caja.innerHTML = vacioT("Cargando…");
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
    estado.taller.grupo = $("#ta-grupo").value; pintarTaller(true);
    const sub = $("#sub-pestana");
    if(sub && estado.pestana === "hoy") sub.innerHTML = subDia(estado.taller, estado.taller.fecha === hoy());
  });
  $("#ta-hoy").addEventListener("click", () => {
    estado.taller.fecha = hoy(); estado.vista = "instructor"; pintar(); cargarTaller();
  });
  $("#ta-refrescar").addEventListener("click", () => cargarTaller());
  $("#filtros-dia").addEventListener("click", ev => {
    const b = ev.target.closest("[data-f]");
    if(!b) return;
    estado.taller.filtro = b.dataset.f;
    pintarTaller(true);
  });

  // Mientras el tablero esté abierto se refresca solo: el instructor lo deja
  // puesto y camina por el taller. Solo el cuerpo, para no perderle el sitio.
  clearInterval(estado.latido);
  estado.latido = setInterval(() => {
    if(estado.vista === "instructor" && estado.pestana === "hoy") cargarTaller();
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
