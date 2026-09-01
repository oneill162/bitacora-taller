// Los informes y la caza de duplicados. Sin DOM y sin red: entran perfiles,
// equipos y diagnósticos; salen filas ya sumadas.
//
// Vive aparte por lo mismo que taller.js: es donde una suma mal hecha no se
// nota mirando la pantalla. Se prueba en pruebas/prueba.mjs.

/* ================= normalizar para comparar ================= */
// "ABC-1234", "abc 1234" y "ABC1234" son la misma máquina escrita por tres
// estudiantes distintos. Para comparar se quita todo lo que no sea letra o
// número; para ENSEÑAR se usa siempre el texto original tal como se escribió.
export const normSerial = s =>
  String(s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");

// Los nombres se comparan sin tildes ni dobles espacios: "José Díaz" y
// "Jose  Diaz" son la misma persona con dos cuentas.
export const normNombre = s =>
  String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/\s+/g, " ").trim();

/* ================= qué le falta a una hoja ================= */
// El taller no bloquea nada: una hoja incompleta se guarda, sube y se entrega
// igual. Lo que hace esto es decir QUÉ falta, para que salga marcada en el
// tablero y en los informes y el docente decida.
//
// El serial va primero porque es el que más duele: sin él la hoja no se une
// al historial del equipo y el inventario no la ve.
export function faltantes(diag, equipo, totalPuntos) {
  const falta = [];
  const vacio = v => !String(v ?? "").trim();
  const c = diag?.conteo || {};
  const sin = typeof c.sin === "number" ? c.sin : totalPuntos;

  if (vacio(equipo?.serial)) falta.push("el serial del equipo");
  if (vacio(equipo?.marca) || vacio(equipo?.modelo)) falta.push("marca o modelo");
  if (vacio(diag?.sistema)) falta.push("el sistema operativo");
  if (sin > 0) falta.push(`${sin} ${sin === 1 ? "punto" : "puntos"} sin evaluar`);
  if (vacio(diag?.hallazgos)) falta.push("los hallazgos");
  if (vacio(diag?.orden)) falta.push("el número de orden");
  return falta;
}

export const estaIncompleta = (diag, equipo, totalPuntos) =>
  faltantes(diag, equipo, totalPuntos).length > 0;

/* ================= informes ================= */
const evaluados = (diag, totalPuntos) => {
  const c = diag?.conteo || {};
  const sin = typeof c.sin === "number" ? c.sin : totalPuntos;
  return Math.max(0, Math.min(totalPuntos, totalPuntos - sin));
};

// De más reciente a más vieja. La fecha sola no basta: dos hojas del mismo
// día empatan y el "último veredicto" saldría a suertes según el orden en que
// llegaran de la base. Se desempata por cuándo se tocó por última vez.
const masReciente = (a, b) =>
  String(b.fecha || "").localeCompare(String(a.fecha || "")) ||
  String(b.actualizado_en || "").localeCompare(String(a.actualizado_en || ""));

const sumar = (diags, totalPuntos) => {
  const entregadas = diags.filter(d => d.estado === "entregado");
  return {
    hojas: diags.length,
    entregadas: entregadas.length,
    borradores: diags.length - entregadas.length,
    puntos: diags.reduce((n, d) => n + evaluados(d, totalPuntos), 0),
    fallas: diags.reduce((n, d) => n + (d.conteo?.falla || 0), 0),
    observaciones: diags.reduce((n, d) => n + (d.conteo?.obs || 0), 0),
    noAptos: entregadas.filter(d => d.veredicto === "no").length,
    ultima: diags.map(d => d.fecha).sort().pop() || null
  };
};

// Una fila por estudiante, tenga trabajo o no. El que no aparece es el que
// hay que buscar, así que no se le puede caer del informe.
export function porEstudiante(estudiantes, diagnosticos, totalPuntos, equiposPorId = {}) {
  return estudiantes.map(e => {
    const suyas = diagnosticos.filter(d => d.autor_id === e.id);
    return {
      id: e.id,
      nombre: e.nombre || e.usuario,
      usuario: e.usuario,
      grupo: e.grupo || "",
      ...sumar(suyas, totalPuntos),
      incompletas: suyas.filter(d =>
        estaIncompleta(d, equiposPorId[d.equipo_id], totalPuntos)).length
    };
  }).sort((a, b) => b.hojas - a.hojas || b.puntos - a.puntos ||
                    a.nombre.localeCompare(b.nombre, "es"));
}

export function porGrupo(estudiantes, diagnosticos, totalPuntos) {
  const grupos = [...new Set(estudiantes.map(e => e.grupo || "Sin grupo"))].sort();
  return grupos.map(g => {
    const gente = estudiantes.filter(e => (e.grupo || "Sin grupo") === g);
    const ids = new Set(gente.map(e => e.id));
    const suyas = diagnosticos.filter(d => ids.has(d.autor_id));
    return {
      grupo: g,
      estudiantes: gente.length,
      activos: new Set(suyas.map(d => d.autor_id)).size,
      ...sumar(suyas, totalPuntos)
    };
  });
}

// Por dónde está la máquina, no por quién la miró. Sirve para inventario y
// para saber qué salón tiene los equipos peor.
export function porSalon(equipos, diagnosticos, totalPuntos) {
  const salones = [...new Set(equipos.map(e => (e.ubicacion || "").trim() || "Sin ubicación"))].sort();
  return salones.map(s => {
    const suyos = equipos.filter(e => ((e.ubicacion || "").trim() || "Sin ubicación") === s);
    const ids = new Set(suyos.map(e => e.id));
    const suyas = diagnosticos.filter(d => ids.has(d.equipo_id));
    const ultimoPorEquipo = suyos.map(eq => {
      const hist = suyas.filter(d => d.equipo_id === eq.id && d.estado === "entregado")
        .sort(masReciente);
      return hist.length ? hist[0].veredicto : "";
    });
    // Estos cuentan EQUIPOS por su último veredicto; los de sumar() cuentan
    // HOJAS. Llevan nombres distintos a propósito: cuando se llamaban igual,
    // el spread de sumar() pisaba el conteo de equipos sin que se notara.
    return {
      salon: s,
      equipos: suyos.length,
      diagnosticados: new Set(suyas.map(d => d.equipo_id)).size,
      equiposAptos:   ultimoPorEquipo.filter(v => v === "apto").length,
      equiposConObs:  ultimoPorEquipo.filter(v => v === "obs").length,
      equiposNoAptos: ultimoPorEquipo.filter(v => v === "no").length,
      equiposSinVeredicto: ultimoPorEquipo.filter(v => !v).length,
      ...sumar(suyas, totalPuntos)
    };
  });
}

// El inventario no se teclea aparte: se va llenando solo con lo que los
// estudiantes escriben en el campo del serial.
export function inventario(equipos, diagnosticos, perfilesPorId = {}) {
  return equipos.map(eq => {
    const hist = diagnosticos.filter(d => d.equipo_id === eq.id).sort(masReciente);
    const entregadas = hist.filter(d => d.estado === "entregado");
    const ultima = entregadas[0] || hist[0] || null;
    return {
      id: eq.id,
      serial: eq.serial,
      marca: eq.marca || "", modelo: eq.modelo || "", tipo: eq.tipo || "",
      inventario: eq.inventario || "",
      ubicacion: (eq.ubicacion || "").trim() || "Sin ubicación",
      revisiones: hist.length,
      ultimaFecha: ultima?.fecha || null,
      ultimoVeredicto: entregadas[0]?.veredicto || "",
      ultimoTecnico: ultima ? (perfilesPorId[ultima.autor_id]?.nombre
                            || perfilesPorId[ultima.autor_id]?.usuario || "") : ""
    };
  }).sort((a, b) => a.ubicacion.localeCompare(b.ubicacion, "es") ||
                    a.serial.localeCompare(b.serial, "es"));
}

/* ================= duplicados ================= */
const agrupar = (filas, clave) => {
  const m = new Map();
  filas.forEach(f => {
    const k = clave(f);
    if (!k) return;
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(f);
  });
  return [...m.entries()].filter(([, v]) => v.length > 1);
};

// Cuatro cosas distintas que el docente llamaría "duplicado". Se detectan,
// no se arreglan solas: unificar borra filas y eso lo decide una persona.
export function duplicados(equipos, diagnosticos, estudiantes, perfilesPorId = {}) {
  return {
    // la misma máquina escrita de varias formas
    serial: agrupar(equipos, e => normSerial(e.serial))
      .map(([clave, eqs]) => ({ clave, equipos: eqs,
        revisiones: eqs.map(eq => diagnosticos.filter(d => d.equipo_id === eq.id).length) })),

    // dos máquinas distintas con el mismo número de inventario del plantel
    inventario: agrupar(equipos, e => normSerial(e.inventario))
      .map(([clave, eqs]) => ({ clave, equipos: eqs })),

    // el mismo equipo diagnosticado dos veces el mismo día
    hojas: agrupar(diagnosticos.filter(d => d.equipo_id), d => `${d.equipo_id}|${d.fecha}`)
      .map(([clave, ds]) => {
        const [equipo_id, fecha] = clave.split("|");
        return { equipo_id, fecha, hojas: ds,
                 autores: [...new Set(ds.map(d => perfilesPorId[d.autor_id]?.nombre
                                               || perfilesPorId[d.autor_id]?.usuario || "?"))] };
      }),

    // la misma persona con dos cuentas
    estudiantes: agrupar(estudiantes.filter(e => normNombre(e.nombre)), e => normNombre(e.nombre))
      .map(([clave, gente]) => ({ clave, estudiantes: gente,
        hojas: gente.map(g => diagnosticos.filter(d => d.autor_id === g.id).length) }))
  };
}

export const hayDuplicados = d =>
  d.serial.length + d.inventario.length + d.hojas.length + d.estudiantes.length;

// Al unificar equipos, cuál se queda. Se decide por tres criterios en orden,
// y el primero que los separe manda:
//
//   1. el historial: mover hojas es lo único que puede salir mal, así que se
//      mueven las menos posibles;
//   2. lo completo que esté el registro: el que tiene número de inventario y
//      ubicación es el que costó llenar, y borrarlo perdería esos datos;
//   3. el serial escrito en limpio, sin guiones ni espacios de más.
//
// El criterio 2 no estaba al principio y el ganador salía siendo "abc-1234"
// —minúsculas, con guion y sin inventario— por encima de "ABC1234", solo
// porque el guion lo hacía más largo. La longitud premiaba el ruido.
export function elegirSuperviviente(equipos, revisiones) {
  const CAMPOS = ["inventario", "marca", "modelo", "tipo", "ubicacion"];
  const puntaje = (eq, i) => [
    revisiones[i],
    CAMPOS.filter(k => String(eq[k] ?? "").trim()).length,
    String(eq.serial) === normSerial(eq.serial) ? 1 : 0
  ];
  let mejor = 0;
  equipos.forEach((eq, i) => {
    const a = puntaje(eq, i), b = puntaje(equipos[mejor], mejor);
    for (let k = 0; k < a.length; k++) {
      if (a[k] !== b[k]) { if (a[k] > b[k]) mejor = i; break; }
    }
  });
  return mejor;
}
