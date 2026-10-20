// Las cifras del dashboard. Sin DOM y sin red: entran hojas, equipos y gente;
// salen números y series ya sumadas. Se prueba en pruebas/resumen.mjs.
//
// Dos vistas, a propósito distintas (así lo hacen los sistemas de inventario y de
// aula que se revisaron): el estudiante ve SU trabajo y qué hacer ahora; el
// instructor ve el taller entero y dónde intervenir.
import { faltantes, incompletos, normSerial } from "./informes.js";

const DIA = 86400000;
const iso = d => d.toISOString().slice(0, 10);
const hoyIso = () => iso(new Date());

// "2026-09-28" → fecha a mediodía UTC, para que sumar días no salte por zona horaria
const fecha = s => new Date(`${String(s).slice(0, 10)}T12:00:00Z`);

// los últimos n días, el más viejo primero, con su cuenta
export function porDia(hojas, n = 14, hoy = hoyIso()) {
  const fin = fecha(hoy);
  const dias = Array.from({ length: n }, (_, i) => iso(new Date(fin.getTime() - (n - 1 - i) * DIA)));
  const cuenta = Object.fromEntries(dias.map(d => [d, 0]));
  hojas.forEach(h => { const d = String(h.fecha).slice(0, 10); if (d in cuenta) cuenta[d]++; });
  return dias.map(d => ({ clave: d, etiqueta: d.slice(8) + "/" + d.slice(5, 7), valor: cuenta[d] }));
}

// las últimas n semanas (lunes a domingo), la más vieja primero
export function porSemana(hojas, n = 8, hoy = hoyIso()) {
  const f = fecha(hoy);
  const lunes = new Date(f.getTime() - ((f.getUTCDay() + 6) % 7) * DIA);
  const semanas = Array.from({ length: n }, (_, i) => new Date(lunes.getTime() - (n - 1 - i) * 7 * DIA));
  const cuenta = semanas.map(() => 0);
  hojas.forEach(h => {
    const t = fecha(h.fecha).getTime();
    const i = Math.floor((t - semanas[0].getTime()) / (7 * DIA));
    if (i >= 0 && i < n) cuenta[i]++;
  });
  return semanas.map((s, i) => {
    const d = iso(s);
    return { clave: d, etiqueta: d.slice(8) + "/" + d.slice(5, 7), valor: cuenta[i] };
  });
}

const media = nums => {
  const n = nums.filter(x => x != null).map(Number);
  return n.length ? Math.round(n.reduce((a, b) => a + b, 0) / n.length * 10) / 10 : null;
};

const vered = hojas => ({
  apto: hojas.filter(h => h.veredicto === "apto").length,
  obs: hojas.filter(h => h.veredicto === "obs").length,
  no: hojas.filter(h => h.veredicto === "no").length
});

/* ================= el estudiante ================= */
// `lista` son sus hojas, cada una con su equipo anidado (`equipos`), como las
// guarda la app en el teléfono; por eso esto funciona también sin señal.
export function resumenEstudiante(lista, totalPuntos, hoy = hoyIso()) {
  const entregadas = lista.filter(h => h.estado === "entregado");
  const borradores = lista.filter(h => h.estado !== "entregado")
    .sort((a, b) => String(b.actualizado_en || b.creado_en || "").localeCompare(String(a.actualizado_en || a.creado_en || "")));
  const pendientes = entregadas
    .map(h => ({ hoja: h, falta: faltantes(h, h.equipos, totalPuntos) }))
    .filter(x => x.falta.length);
  const puntos = { ok: 0, obs: 0, falla: 0, na: 0 };
  lista.forEach(h => Object.keys(puntos).forEach(k => { puntos[k] += h.conteo?.[k] || 0; }));
  return {
    hojas: lista.length,
    entregadas: entregadas.length,
    borradores: borradores.length,
    borradorReciente: borradores[0] || null,
    pendientes,                                   // entregadas a las que les falta algo
    veredictos: vered(entregadas),
    puntos,
    notaMedia: media(lista.map(h => h.nota)),
    calificadas: lista.filter(h => h.nota != null)
      .sort((a, b) => String(b.fecha).localeCompare(String(a.fecha))).slice(0, 3),
    semanas: porSemana(lista, 8, hoy),
    recientes: [...lista].sort((a, b) =>
      String(b.fecha).localeCompare(String(a.fecha)) ||
      String(b.creado_en || "").localeCompare(String(a.creado_en || ""))).slice(0, 5)
  };
}

/* ================= el instructor ================= */
// `d` es lo que baja cargarDatos(): estudiantes, equipos, diagnosticos, porId.
export function resumenTaller(d, totalPuntos, hoy = hoyIso()) {
  const gente = Object.values(d.porId || {});
  const entregadas = d.diagnosticos.filter(h => h.estado === "entregado");
  const filasInc = incompletos(d.equipos, d.diagnosticos, totalPuntos);
  const conHojas = new Set(d.diagnosticos.map(h => h.autor_id));
  const cuenta = (items, clave, vacio) => {
    const m = new Map();
    items.forEach(x => { const k = String(clave(x) || "").trim() || vacio; m.set(k, (m.get(k) || 0) + 1); });
    return [...m.entries()].map(([etiqueta, valor]) => ({ etiqueta, valor }))
      .sort((a, b) => b.valor - a.valor || a.etiqueta.localeCompare(b.etiqueta, "es"));
  };
  // motivo → cuántos: lo que más se le olvida a la clase
  const motivos = new Map();
  filasInc.forEach(f => f.falta.forEach(x => {
    const k = x.replace(/^\d+ (puntos?) sin evaluar$/, "puntos sin evaluar");
    motivos.set(k, (motivos.get(k) || 0) + 1);
  }));
  const seriales = new Set(d.equipos.map(e => normSerial(e.serial)));
  return {
    estudiantes: d.estudiantes.length,
    sinHojas: d.estudiantes.filter(e => !conHojas.has(e.id)).length,
    instructores: gente.filter(p => p.rol === "instructor").length,
    solicitudes: gente.filter(p => p.solicita_instructor && p.rol !== "instructor").length,
    hojas: d.diagnosticos.length,
    entregadas: entregadas.length,
    entregadasHoy: entregadas.filter(h => String(h.fecha).slice(0, 10) === hoy).length,
    sinCalificar: entregadas.filter(h => h.nota == null).length,
    notaMedia: media(d.diagnosticos.map(h => h.nota)),
    equipos: d.equipos.length,
    equiposDistintos: seriales.size,
    incompletos: filasInc.length,
    motivos: [...motivos.entries()].map(([etiqueta, valor]) => ({ etiqueta, valor }))
      .sort((a, b) => b.valor - a.valor),
    veredictos: vered(entregadas),
    dias: porDia(entregadas, 14, hoy),
    porMarca: cuenta(d.equipos, e => e.marca, "Sin marca").slice(0, 6),
    porSalon: cuenta(d.equipos, e => e.ubicacion, "Sin ubicación").slice(0, 6),
    porGrupo: cuenta(d.estudiantes, e => e.grupo, "Sin grupo"),
    topEstudiantes: d.estudiantes.map(e => ({
      etiqueta: e.nombre || e.usuario,
      valor: d.diagnosticos.filter(h => h.autor_id === e.id).length
    })).sort((a, b) => b.valor - a.valor).slice(0, 8)
  };
}

