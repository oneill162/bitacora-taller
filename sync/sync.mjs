#!/usr/bin/env node
/**
 * Sincroniza Supabase → vault de Obsidian.
 *
 *   node sync/sync.mjs            baja y escribe
 *   node sync/sync.mjs --dry      enseña qué haría, sin tocar archivos
 *   node sync/sync.mjs --limpiar  además borra notas de diagnósticos que ya no existen
 *
 * Sin dependencias: usa fetch nativo contra la API REST de Supabase.
 * Necesita la llave service_role, que SALTA Row Level Security — por eso
 * este script corre solo en la máquina del instructor y .env nunca se sube.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, unlinkSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
// Compartidos con la app: el protocolo y la regla de qué hace que una hoja
// esté a medias. Si se definieran aquí otra vez, el vault y la app acabarían
// diciendo cosas distintas del mismo diagnóstico.
import { PUNTOS, VEREDICTOS } from "../docs/protocolo.js";
import { faltantes } from "../docs/informes.js";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DRY     = process.argv.includes("--dry");
const LIMPIAR = process.argv.includes("--limpiar");

/* ---------- configuración ---------- */
function cargarEnv() {
  const ruta = join(RAIZ, ".env");
  if (!existsSync(ruta)) {
    console.error("Falta el archivo .env. Copia .env.ejemplo a .env y llénalo.");
    process.exit(1);
  }
  const env = {};
  for (const linea of readFileSync(ruta, "utf8").split("\n")) {
    const m = linea.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  for (const req of ["SUPABASE_URL", "SUPABASE_SERVICE_KEY"]) {
    if (!env[req]) { console.error(`Falta ${req} en .env`); process.exit(1); }
  }
  env.VAULT = env.VAULT_DIR ? resolve(env.VAULT_DIR) : join(RAIZ, "vault");
  return env;
}
const ENV = cargarEnv();

async function api(recurso, query = "select=*") {
  const url = `${ENV.SUPABASE_URL.replace(/\/$/, "")}/rest/v1/${recurso}?${query}`;
  const res = await fetch(url, {
    headers: {
      apikey: ENV.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${ENV.SUPABASE_SERVICE_KEY}`,
      Accept: "application/json"
    }
  });
  if (!res.ok) throw new Error(`${recurso}: ${res.status} ${await res.text()}`);
  return res.json();
}

/* ---------- helpers ---------- */
const ETQ = { ok: "Bien", obs: "Observación", falla: "Falla", na: "N/A", "": "—" };

// Obsidian se atraganta con estos caracteres en nombres de archivo y enlaces
const limpio = s => String(s ?? "").replace(/[\/\\:*?"<>|#^\[\]]/g, "-").replace(/\s+/g, " ").trim();
const yaml = s => JSON.stringify(String(s ?? ""));   // comillas y escapes válidos en YAML

function escribir(ruta, texto, soloSiFalta = false) {
  if (soloSiFalta && existsSync(ruta)) return "saltado";
  if (existsSync(ruta) && readFileSync(ruta, "utf8") === texto) return "igual";
  if (!DRY) {
    mkdirSync(dirname(ruta), { recursive: true });
    writeFileSync(ruta, texto, "utf8");
  }
  return existsSync(ruta) ? "actualizado" : "nuevo";
}

/* ---------- notas ---------- */
function notaDiagnostico(d, puntos) {
  const c = d.conteo || {};
  // La misma regla que usa la app para marcar "falta culminar": una sola
  // definición para las dos.
  const falta = faltantes(
    { conteo: c, sistema: d.sistema, hallazgos: d.hallazgos, orden: d.orden },
    { serial: d.equipo_serial, marca: d.equipo_marca, modelo: d.equipo_modelo },
    PUNTOS.length);
  const nombreEquipo = d.equipo_serial
    ? limpio(`${d.equipo_marca || ""} ${d.equipo_modelo || ""}`.trim() || d.equipo_serial)
    : null;

  const fm = [
    "---",
    "tipo: diagnostico",
    `id: ${yaml(d.id)}`,
    `orden: ${yaml(d.orden)}`,
    `fecha: ${d.fecha}`,
    `estado: ${yaml(d.estado)}`,
    `veredicto: ${yaml(d.veredicto)}`,
    `veredicto_texto: ${yaml(VEREDICTOS[d.veredicto] || "Sin evaluar")}`,
    `estudiante: ${yaml(d.autor_usuario)}`,
    `estudiante_nombre: ${yaml(d.autor_nombre)}`,
    `grupo: ${yaml(d.autor_grupo)}`,
    `escuela: ${yaml(d.autor_escuela)}`,
    `equipo: ${yaml(nombreEquipo || "")}`,
    `equipo_serial: ${yaml(d.equipo_serial || "")}`,
    `equipo_inventario: ${yaml(d.equipo_inventario || "")}`,
    `equipo_tipo: ${yaml(d.equipo_tipo || "")}`,
    `salon: ${yaml(d.equipo_ubicacion || "")}`,
    `sistema: ${yaml(d.sistema)}`,
    `proximo_paso: ${yaml(d.proximo_paso)}`,
    `ok: ${c.ok || 0}`,
    `obs: ${c.obs || 0}`,
    `falla: ${c.falla || 0}`,
    `na: ${c.na || 0}`,
    `sin: ${c.sin || 0}`,
    `entregado_en: ${yaml(d.entregado_en || "")}`,
    `completa: ${falta.length === 0}`,
    `falta: ${yaml(falta.join(", "))}`,
    "tags: [diagnostico]",
    "---",
    ""
  ].join("\n");

  const enlaces = [
    nombreEquipo ? `Equipo: [[${nombreEquipo}]]` : "Equipo sin identificar",
    `Técnico: [[${limpio(d.autor_usuario)}]]`
  ].join(" · ");

  // agrupados por el número de grupo del protocolo
  const porGrupo = {};
  for (const p of puntos) (porGrupo[p.grupo] ||= []).push(p);
  const cuerpo = Object.keys(porGrupo).sort().map(g => {
    const filas = porGrupo[g]
      .sort((a, b) => a.clave.localeCompare(b.clave, "en", { numeric: true }))
      .map(p => `| ${ETQ[p.estado] || "—"} | ${p.titulo} | ${p.nota || ""} |`)
      .join("\n");
    return `### Grupo ${g}\n\n| Estado | Punto | Nota |\n|---|---|---|\n${filas}\n`;
  }).join("\n");

  return `${fm}> [!info] Nota generada
> Espejo de la base de datos. Se reescribe en cada sincronización — no la edites a mano.

# ${d.orden || "Diagnóstico"} · ${d.fecha}

${enlaces}

**${VEREDICTOS[d.veredicto] || "Sin evaluar"}** — ${c.ok || 0} bien · ${c.obs || 0} observación · ${c.falla || 0} falla · ${c.na || 0} N/A · ${c.sin || 0} sin evaluar
${falta.length ? `
> [!warning] Falta culminar
> Queda por poner: ${falta.join(", ")}.
` : ""}
## Hoja de cotejo

${cuerpo}
## Acciones realizadas

${d.acciones || "_No se registraron acciones._"}

## Hallazgos y recomendaciones

${d.hallazgos || "_No se registraron hallazgos._"}

## Próximo paso

${d.proximo_paso || "_Sin definir._"}
`;
}

const notaEquipo = e => `---
tipo: equipo
serial: ${yaml(e.serial)}
marca: ${yaml(e.marca)}
modelo: ${yaml(e.modelo)}
tipo_equipo: ${yaml(e.tipo)}
inventario: ${yaml(e.inventario)}
ubicacion: ${yaml(e.ubicacion)}
tags: [equipo]
---
# ${limpio(`${e.marca || ""} ${e.modelo || ""}`.trim() || e.serial)}

Serial \`${e.serial}\`${e.inventario ? ` · inventario \`${e.inventario}\`` : ""}${e.ubicacion ? ` · ${e.ubicacion}` : "  ·  _sin salón registrado_"}

## Historial de diagnósticos
\`\`\`dataview
TABLE WITHOUT ID file.link AS "Hoja", fecha AS "Fecha", estudiante AS "Técnico", veredicto_texto AS "Veredicto", falla AS "Fallas"
FROM "04-Diagnosticos"
WHERE equipo_serial = this.serial
SORT fecha DESC
\`\`\`

## Notas del instructor
_Lo que escribas aquí sobrevive a las sincronizaciones._
`;

const notaEstudiante = p => `---
tipo: estudiante
usuario: ${yaml(p.usuario)}
nombre: ${yaml(p.nombre)}
grupo: ${yaml(p.grupo)}
escuela: ${yaml(p.escuela)}
rol: ${yaml(p.rol)}
tags: [estudiante]
---
# ${limpio(p.usuario)}

${p.nombre || "(sin nombre registrado)"}${p.grupo ? ` · ${p.grupo}` : ""}

## Diagnósticos entregados
\`\`\`dataview
TABLE WITHOUT ID file.link AS "Hoja", fecha AS "Fecha", equipo AS "Equipo", veredicto_texto AS "Veredicto"
FROM "04-Diagnosticos"
WHERE estudiante = this.usuario AND estado = "entregado"
SORT fecha DESC
\`\`\`

## Borradores abiertos
\`\`\`dataview
TABLE WITHOUT ID file.link AS "Hoja", fecha AS "Empezada"
FROM "04-Diagnosticos"
WHERE estudiante = this.usuario AND estado = "borrador"
\`\`\`

## Notas del instructor
_Lo que escribas aquí sobrevive a las sincronizaciones._
`;

/* ---------- corrida ---------- */
async function main() {
  console.log(DRY ? "— Simulación, no se escribe nada —\n" : "");

  const [diags, puntos, perfiles, equipos] = await Promise.all([
    api("vista_diagnosticos", "select=*&order=fecha.desc"),
    api("puntos", "select=*"),
    api("perfiles", "select=*"),
    api("equipos", "select=*")
  ]);

  const puntosPorDiag = {};
  for (const p of puntos) (puntosPorDiag[p.diagnostico_id] ||= []).push(p);

  const cuenta = { nuevo: 0, actualizado: 0, igual: 0, saltado: 0 };
  const vistos = new Set();

  for (const d of diags) {
    const base = limpio(`${d.fecha}-${d.orden || d.id.slice(0, 8)}-${d.autor_usuario}`);
    const ruta = join(ENV.VAULT, "04-Diagnosticos", base + ".md");
    vistos.add(base + ".md");
    cuenta[escribir(ruta, notaDiagnostico(d, puntosPorDiag[d.id] || []))]++;
  }

  for (const e of equipos) {
    const nombre = limpio(`${e.marca || ""} ${e.modelo || ""}`.trim() || e.serial);
    cuenta[escribir(join(ENV.VAULT, "02-Equipos", nombre + ".md"), notaEquipo(e), true)]++;
  }

  for (const p of perfiles) {
    cuenta[escribir(join(ENV.VAULT, "03-Estudiantes", limpio(p.usuario) + ".md"), notaEstudiante(p), true)]++;
  }

  if (LIMPIAR) {
    const dir = join(ENV.VAULT, "04-Diagnosticos");
    if (existsSync(dir)) {
      for (const f of readdirSync(dir).filter(f => f.endsWith(".md"))) {
        if (!vistos.has(f)) {
          console.log(`  borrando huérfana: ${f}`);
          if (!DRY) unlinkSync(join(dir, f));
        }
      }
    }
  }

  console.log(`Diagnósticos: ${diags.length} · equipos: ${equipos.length} · perfiles: ${perfiles.length}`);
  console.log(`Notas nuevas: ${cuenta.nuevo} · actualizadas: ${cuenta.actualizado} · sin cambio: ${cuenta.igual} · conservadas: ${cuenta.saltado}`);
  console.log(`Vault: ${ENV.VAULT}`);
}

main().catch(err => { console.error("\nFalló la sincronización:", err.message); process.exit(1); });
