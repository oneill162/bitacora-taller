// Cómo se arma el tablero del día del instructor. Sin DOM y sin red: solo
// estudiantes y hojas entrando, filas saliendo.
//
// Vive aparte de app.js porque es lo que se puede equivocar en silencio —una
// hoja colgada del estudiante que no es, un conteo que no cuadra— y así se
// prueba sin navegador ni Supabase. Ver pruebas/prueba.mjs.

// Cuánto lleva hecho de los puntos del protocolo. Sin conteo guardado, cero:
// una hoja recién creada no tiene nada evaluado.
export function avance(hoja, total) {
  const c = hoja?.conteo || {};
  const sin = typeof c.sin === "number" ? c.sin : total;
  return { hechos: Math.max(0, Math.min(total, total - sin)), total };
}

// Para ver de un vistazo quién lleva rato sin tocar nada.
export function haceCuanto(iso, ahora = Date.now()) {
  if (!iso) return "";
  const min = Math.floor((ahora - new Date(iso).getTime()) / 60000);
  if (min < 2) return "ahora";
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  return `hace ${Math.floor(h / 24)} d`;
}

const porNombre = (a, b) =>
  (a.nombre || a.usuario || "").localeCompare(b.nombre || b.usuario || "", "es");

// Las hojas de más nueva a más vieja. Si nunca se actualizó, al final.
const porReciente = (a, b) =>
  String(b.actualizado_en || "").localeCompare(String(a.actualizado_en || ""));

export const deGrupo = (estudiantes, grupo) =>
  grupo ? estudiantes.filter(e => e.grupo === grupo) : estudiantes.slice();

// Una entrada por estudiante, tenga hojas o no. Eso es lo que la tabla de
// diagnósticos no podía dar: el que no hizo nada no tiene diagnóstico, pero
// sí es la primera persona por la que pregunta el instructor.
//
// `tipo` dice cómo se pinta la fila:
//   "sin"    — no empezó
//   "una"    — una hoja: la fila la representa entera
//   "varias" — más de una: la fila es encabezado y las hojas van debajo,
//              porque ningún número solo diría la verdad sobre el estudiante
//              (enseñar la última tocada escondería que ya entregó otra).
export function filasTaller(estudiantes, hojas, grupo = "") {
  return deGrupo(estudiantes, grupo).sort(porNombre).map(e => {
    const suyas = (hojas || []).filter(h => h.autor_id === e.id).sort(porReciente);
    return {
      estudiante: e,
      hojas: suyas,
      entregadas: suyas.filter(h => h.estado === "entregado").length,
      tipo: suyas.length === 0 ? "sin" : suyas.length === 1 ? "una" : "varias"
    };
  });
}

// Se cuenta sobre los estudiantes del grupo, no sobre las hojas: "3 de 5
// empezaron" solo significa algo si el 5 incluye a los que no empezaron.
export function resumenTaller(estudiantes, hojas, grupo = "") {
  const gente = deGrupo(estudiantes, grupo);
  const ids = new Set(gente.map(e => e.id));
  const suyas = (hojas || []).filter(h => ids.has(h.autor_id));
  return {
    total: gente.length,
    empezaron: new Set(suyas.map(h => h.autor_id)).size,
    entregaron: new Set(suyas.filter(h => h.estado === "entregado").map(h => h.autor_id)).size
  };
}
