// Las cifras del dashboard (docs/resumen.js): funciones puras, sin navegador.
//   node pruebas/resumen.mjs
import assert from "node:assert/strict";
import { porDia, porSemana, resumenEstudiante, resumenTaller } from "../docs/resumen.js";

const HOY = "2026-10-21"; // miércoles
const ok = { sistema: "W11", hallazgos: "x", orden: "1", conteo: { ok: 38, obs: 1, falla: 1, na: 0, sin: 0 } };
const eq = { id: "q1", serial: "A1", marca: "HP", modelo: "X", ubicacion: "Salón 1", creado_por: "e1" };
const eq2 = { id: "q2", serial: "a-1", marca: "", modelo: "", ubicacion: "", creado_por: "e2" };

// días y semanas
const d = porDia([{ fecha: "2026-10-21" }, { fecha: "2026-10-21" }, { fecha: "2026-10-19" }, { fecha: "2026-01-01" }], 3, HOY);
assert.deepEqual(d.map(x => x.valor), [1, 0, 2]);
assert.equal(d[2].etiqueta, "21/10");
const s = porSemana([{ fecha: "2026-10-19" }, { fecha: "2026-10-25" }, { fecha: "2026-10-12" }, { fecha: "2026-10-26" }], 2, HOY);
assert.deepEqual(s.map(x => x.valor), [1, 2]); // sem. del 12: 1; sem. del 19: lunes 19 y domingo 25; el 26 queda fuera

// estudiante: sus hojas, lo pendiente y la nota media
const lista = [
  { id: "h1", estado: "entregado", veredicto: "apto", fecha: "2026-10-19", nota: 90, equipos: eq, ...ok },
  { id: "h2", estado: "entregado", veredicto: "obs", fecha: "2026-10-20", nota: null, equipos: eq2, ...ok },
  { id: "h3", estado: "borrador", veredicto: "", fecha: "2026-10-21", equipos: null, conteo: {}, actualizado_en: "2026-10-21T10:00:00Z" }
];
const e = resumenEstudiante(lista, 40, HOY);
assert.equal(e.hojas, 3); assert.equal(e.entregadas, 2); assert.equal(e.borradores, 1);
assert.equal(e.borradorReciente.id, "h3");
assert.equal(e.pendientes.length, 1);                 // h2: sin marca ni modelo
assert.equal(e.pendientes[0].hoja.id, "h2");
assert.equal(e.notaMedia, 90);
assert.deepEqual(e.veredictos, { apto: 1, obs: 1, no: 0 });
assert.equal(e.puntos.ok, 76);
assert.equal(e.recientes[0].id, "h3");
assert.equal(resumenEstudiante([], 40, HOY).notaMedia, null);

// instructor: el taller entero
const datos = {
  estudiantes: [{ id: "e1", grupo: "TESI 2", nombre: "Ana" }, { id: "e2", grupo: "TESI 2", nombre: "Luis" }, { id: "e3", grupo: "", nombre: "Sol" }],
  equipos: [eq, eq2],
  diagnosticos: [{ ...lista[0], autor_id: "e1", equipo_id: "q1" }, { ...lista[1], autor_id: "e2", equipo_id: "q2", fecha: HOY }],
  porId: { e1: { rol: "estudiante" }, e2: { rol: "estudiante", solicita_instructor: true }, i1: { rol: "instructor" } }
};
const t = resumenTaller(datos, 40, HOY);
assert.equal(t.estudiantes, 3); assert.equal(t.sinHojas, 1);
assert.equal(t.entregadas, 2); assert.equal(t.entregadasHoy, 1);
assert.equal(t.sinCalificar, 1);
assert.equal(t.solicitudes, 1); assert.equal(t.instructores, 1);
assert.equal(t.equipos, 2); assert.equal(t.equiposDistintos, 1);   // "A1" y "a-1" son la misma máquina
assert.equal(t.incompletos, 1);
assert.deepEqual(t.porMarca.map(x => x.etiqueta), ["HP", "Sin marca"]);
assert.equal(t.porGrupo[0].etiqueta, "TESI 2");
assert.equal(t.topEstudiantes[0].valor, 1);
assert.ok(t.motivos.some(m => m.etiqueta === "marca o modelo"));
console.log("resumen.js: todo bien");
